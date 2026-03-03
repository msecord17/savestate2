-- 0) Lock down the UUID-based function (it should NOT be callable by anon/public)
revoke all on function public.get_origin_timeline(uuid) from public;
revoke all on function public.get_origin_timeline(uuid) from anon;
grant execute on function public.get_origin_timeline(uuid) to authenticated;

-- 1) Public-safe version keyed by username (only returns data for profile_public users)
create or replace function public.get_public_origin_timeline(p_username text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
with
-- Resolve username -> user_id ONLY if profile is public.
pub as (
  select p.user_id
  from public.profiles p
  where p.profile_public = true
    and p.username is not null
    and lower(p.username) = lower(trim(p_username))
  limit 1
),

-- If not public/not found, return empty.
guard as (
  select user_id from pub
),

owned as (
  select
    pe.user_id,
    pe.release_id,
    r.game_id,
    r.platform_key,
    r.display_title,
    coalesce(g.cover_url, r.cover_url) as cover_url,
    g.first_release_year as origin_year
  from guard
  join public.portfolio_entries pe on pe.user_id = guard.user_id
  join public.releases r on r.id = pe.release_id
  left join public.release_classifications rc on rc.release_id = r.id
  join public.games g on g.id = r.game_id
  where coalesce(rc.kind, 'game'::public.release_kind) = 'game'::public.release_kind
    and (r.content_type is null or lower(trim(r.content_type)) = 'game')
    and (g.igdb_category is null or g.igdb_category = 0)
    and g.igdb_game_id is not null
    and g.first_release_year is not null
),

owned_clean as (
  select *
  from owned
  where not (
    platform_key = 'xbox'
    and (
      lower(display_title) like '%amazon instant video%'
      or lower(display_title) like '%movies & tv%'
      or lower(display_title) like '%groove%'
      or lower(display_title) like '%iheart%'
      or lower(display_title) like '%netflix%'
      or lower(display_title) like '%youtube%'
    )
  )
),

bucketed as (
  select
    *,
    case
      when origin_year is null then 'unknown'
      when origin_year between 1972 and 1977 then 'gen1_1972_1977'
      when origin_year between 1978 and 1982 then 'gen2_1978_1982'
      when origin_year between 1983 and 1989 then 'gen3_1983_1989'
      when origin_year between 1990 and 1995 then 'gen4_1990_1995'
      when origin_year between 1996 and 1999 then 'gen5_1996_1999'
      when origin_year between 2000 and 2005 then 'gen6_2000_2005'
      when origin_year between 2006 and 2012 then 'gen7_2006_2012'
      when origin_year between 2013 and 2019 then 'gen8_2013_2019'
      when origin_year >= 2020 then 'gen9_2020_plus'
      else 'unknown'
    end as origin_bucket
  from owned_clean
),

psn as (
  select
    p.user_id,
    coalesce(p.release_id, re.release_id) as release_id,
    'Played on: PlayStation'::text as played_on,
    coalesce(p.playtime_minutes, 0)::int as minutes_played,
    coalesce(p.trophies_earned, 0)::int as earned,
    coalesce(p.trophies_total, 0)::int as total,
    p.last_updated_at::timestamptz as last_signal_at
  from guard
  join public.psn_title_progress p on p.user_id = guard.user_id
  left join public.release_external_ids re
    on re.source = 'psn'
   and re.external_id = p.np_communication_id::text
  where coalesce(p.release_id, re.release_id) is not null
),

xbox as (
  select
    x.user_id,
    coalesce(x.release_id, re.release_id) as release_id,
    'Played on: Xbox'::text as played_on,
    0::int as minutes_played,
    coalesce(x.achievements_earned, 0)::int as earned,
    coalesce(x.achievements_total, 0)::int as total,
    coalesce(x.last_played_at, x.last_updated_at)::timestamptz as last_signal_at
  from guard
  join public.xbox_title_progress x on x.user_id = guard.user_id
  left join public.release_external_ids re
    on re.source = 'xbox'
   and re.external_id = x.title_id::text
  where coalesce(x.release_id, re.release_id) is not null
),

steam as (
  select
    s.user_id,
    s.release_id,
    'Played on: PC (Steam)'::text as played_on,
    coalesce(s.playtime_minutes, 0)::int as minutes_played,
    0::int as earned,
    0::int as total,
    s.last_updated_at::timestamptz as last_signal_at
  from guard
  join public.steam_title_progress s on s.user_id = guard.user_id
),

steam_fallback as (
  select
    pe.user_id,
    pe.release_id,
    'Played on: PC (Steam)'::text as played_on,
    coalesce(pe.playtime_minutes, 0)::int as minutes_played,
    0::int as earned,
    0::int as total,
    null::timestamptz as last_signal_at
  from guard
  join public.portfolio_entries pe on pe.user_id = guard.user_id
  join public.releases r on r.id = pe.release_id and lower(r.platform_key) = 'steam'
  left join public.steam_title_progress s
    on s.user_id = pe.user_id and s.release_id = pe.release_id
  where s.release_id is null
),

ra as (
  select
    rac.user_id,
    rac.release_id,
    ('Played on: ' || coalesce(
      (
        select h.display_name
        from public.profiles p
        join public.hardware h on h.id = p.default_ra_hardware_id
        where p.user_id = (select user_id from guard limit 1)
        limit 1
      ),
      'RetroAchievements'
    ))::text as played_on,
    0::int as minutes_played,
    coalesce((
      select count(*)
      from jsonb_array_elements(coalesce(rac.payload->'achievements','[]'::jsonb)) a
      where (a->>'earned')::boolean = true
    ), 0)::int as earned,
    coalesce((
      select count(*)
      from jsonb_array_elements(coalesce(rac.payload->'achievements','[]'::jsonb)) a
    ), 0)::int as total,
    rac.fetched_at::timestamptz as last_signal_at
  from guard
  join public.ra_achievement_cache rac on rac.user_id = guard.user_id
),

signals_raw as (
  select * from psn
  union all select * from xbox
  union all select * from steam
  union all select * from steam_fallback
  union all select * from ra
),

signals_best as (
  select distinct on (user_id, release_id)
    user_id,
    release_id,
    played_on,
    minutes_played,
    earned,
    total,
    last_signal_at
  from signals_raw
  order by user_id, release_id,
    (case when total > 0 then earned::numeric/total::numeric else 0 end) desc,
    minutes_played desc,
    last_signal_at desc nulls last
),

scored_releases as (
  select
    b.origin_bucket,
    b.game_id,
    b.release_id,
    b.display_title as title,
    b.cover_url,
    sb.played_on,
    sb.minutes_played,
    sb.earned,
    sb.total,
    sb.last_signal_at,
    coalesce(
      (
        (case when sb.total > 0 then (sb.earned::numeric / sb.total::numeric) else 0 end) * 100
        + (coalesce(sb.minutes_played,0)::numeric / 6000) * 10
        + (case when sb.last_signal_at is not null then extract(epoch from sb.last_signal_at) / 1e9 else 0 end)
      ),
      1.0
    ) as score
  from bucketed b
  left join signals_best sb
    on sb.user_id = b.user_id and sb.release_id = b.release_id
  where b.origin_bucket <> 'unknown'
),

game_best as (
  select distinct on (origin_bucket, game_id)
    origin_bucket,
    game_id,
    release_id,
    title,
    cover_url,
    played_on,
    earned,
    total,
    minutes_played,
    last_signal_at,
    score
  from scored_releases
  order by origin_bucket, game_id,
    (case when total > 0 then earned::numeric / nullif(total, 0) else 0 end) desc nulls last,
    minutes_played desc nulls last,
    last_signal_at desc nulls last,
    release_id
),

era_stats as (
  select
    origin_bucket,
    count(distinct game_id) as games,
    count(distinct release_id) as releases
  from bucketed
  where origin_bucket <> 'unknown'
  group by origin_bucket
),

ranked as (
  select
    *,
    row_number() over (
      partition by origin_bucket
      order by
        (case when total > 0 then earned::numeric / nullif(total, 0) else 0 end) desc nulls last,
        minutes_played desc nulls last,
        last_signal_at desc nulls last
    ) as rn
  from game_best
)

select
  coalesce(
    (
      select jsonb_build_object(
        'stats', coalesce(
          (select jsonb_object_agg(origin_bucket, jsonb_build_object('games', games, 'releases', releases)) from era_stats),
          '{}'::jsonb
        ),
        'standouts', coalesce((
          select jsonb_object_agg(origin_bucket, standout)
          from (
            select
              origin_bucket,
              jsonb_agg(jsonb_build_object(
                'release_id', release_id,
                'title', title,
                'cover_url', cover_url,
                'played_on', played_on,
                'earned', earned,
                'total', total,
                'minutes_played', minutes_played,
                'score', score
              ) order by rn) as standout
            from ranked
            where rn <= 3
            group by origin_bucket
          ) x
        ), '{}'::jsonb)
      )
    ),
    jsonb_build_object('stats','{}'::jsonb,'standouts','{}'::jsonb)
  );
$$;

comment on function public.get_public_origin_timeline(text)
is 'PUBLIC-SAFE timeline by username. Only returns data when profiles.profile_public=true for that username.';

-- Public-safe to expose
grant execute on function public.get_public_origin_timeline(text) to anon, authenticated;
