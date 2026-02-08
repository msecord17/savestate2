-- Apply get_origin_timeline RPC: canonical-game-based.
-- Group by game_id, era from games.first_release_year only, exclude non-games (content_type),
-- top 3 per era with owned fallback score. Run in Supabase SQL Editor or psql.

create or replace function public.get_origin_timeline(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
with
owned as (
  select
    pe.user_id,
    pe.release_id,
    r.game_id,
    r.platform_key,
    r.display_title,
    coalesce(g.cover_url, r.cover_url) as cover_url,
    g.first_release_year as origin_year
  from portfolio_entries pe
  join releases r on r.id = pe.release_id
  join games g on g.id = r.game_id
  where pe.user_id = p_user_id
    and (r.content_type is null or lower(trim(r.content_type)) = 'game')
    and (g.igdb_category is null or g.igdb_category = 0)
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
      when origin_year between 1976 and 1984 then 'gen2_1976_1984'
      when origin_year between 1983 and 1992 then 'gen3_1983_1992'
      when origin_year between 1987 and 1992 then 'gen4_1987_1996'
      when origin_year between 1993 and 1996 then 'gen5a_1993_1996'
      when origin_year between 1996 and 2001 then 'gen5b_1996_2001'
      when origin_year between 1998 and 2005 then 'gen6_1998_2005'
      when origin_year between 2005 and 2012 then 'gen7_2005_2012'
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
  from psn_title_progress p
  left join release_external_ids re
    on re.source = 'psn'
   and re.external_id = p.np_communication_id::text
  where p.user_id = p_user_id
    and coalesce(p.release_id, re.release_id) is not null
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
  from xbox_title_progress x
  left join release_external_ids re
    on re.source = 'xbox'
   and re.external_id = x.title_id::text
  where x.user_id = p_user_id
    and coalesce(x.release_id, re.release_id) is not null
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
  from steam_title_progress s
  where s.user_id = p_user_id
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
  from portfolio_entries pe
  join releases r on r.id = pe.release_id and lower(r.platform_key) = 'steam'
  left join steam_title_progress s
    on s.user_id = pe.user_id and s.release_id = pe.release_id
  where pe.user_id = p_user_id
    and s.release_id is null
),
ra as (
  select
    rac.user_id,
    rac.release_id,
    'Played on: RetroAchievements'::text as played_on,
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
  from ra_achievement_cache rac
  where rac.user_id = p_user_id
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
    score
  from scored_releases
  order by origin_bucket, game_id, score desc nulls last, release_id
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
    row_number() over (partition by origin_bucket order by score desc nulls last) as rn
  from game_best
)

select jsonb_build_object(
  'stats', coalesce((select jsonb_object_agg(origin_bucket, jsonb_build_object('games', games, 'releases', releases)) from era_stats), '{}'::jsonb),
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
          'score', score
        ) order by rn) as standout
      from ranked
      where rn <= 3
      group by origin_bucket
    ) x
  ), '{}'::jsonb)
);
$$;

comment on function public.get_origin_timeline(uuid) is 'Origin-era timeline: stats + top 3 standout games per bucket (by game_id, era from games.first_release_year). Excludes non-game content_type. Owned fallback score when no signals. Used by GET /api/identity/timeline.';
