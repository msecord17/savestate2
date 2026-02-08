-- Standout titles per ORIGIN era bucket (top 3 per bucket by score)
-- Scoring: achievements completion + playtime + recency
-- Each standout includes played_on label (PSN > Xbox > Steam > RA) so remasters don't masquerade as era-defining

with
owned as (
  select
    pe.user_id,
    pe.release_id,
    r.game_id,
    r.platform_key,
    r.display_title,
    coalesce(g.cover_url, r.cover_url) as cover_url,
    coalesce(
      g.first_release_year,
      case when r.release_date is not null then extract(year from r.release_date)::int end
    ) as origin_year
  from portfolio_entries pe
  join releases r on r.id = pe.release_id
  left join games g on g.id = r.game_id
  where pe.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
),
bucketed as (
  select
    *,
    case
      when origin_year is null then 'unknown'
      when origin_year between 1972 and 1977 then 'gen1_1972_1977'
      when origin_year between 1976 and 1984 then 'gen2_1976_1984'
      when origin_year between 1983 and 1992 then 'gen3_1983_1992'
      when origin_year between 1987 and 1996 then 'gen4_1987_1996'
      when origin_year between 1993 and 1996 then 'gen5a_1993_1996'
      when origin_year between 1996 and 2001 then 'gen5b_1996_2001'
      when origin_year between 1998 and 2005 then 'gen6_1998_2005'
      when origin_year between 2005 and 2012 then 'gen7_2005_2012'
      when origin_year between 2013 and 2019 then 'gen8_2013_2019'
      when origin_year >= 2020 then 'gen9_2020_plus'
      else 'unknown'
    end as origin_bucket
  from owned
),
psn as (
  select
    p.user_id,
    coalesce(p.release_id, re.release_id) as release_id,
    coalesce(p.playtime_minutes, 0)::int as minutes_played,
    coalesce(p.trophies_earned, 0)::int as earned,
    coalesce(p.trophies_total, 0)::int as total,
    p.last_updated_at::timestamptz as last_signal_at
  from psn_title_progress p
  left join release_external_ids re
    on re.source = 'psn'
   and re.external_id = p.np_communication_id::text
  where p.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
    and coalesce(p.release_id, re.release_id) is not null
),
xbox as (
  select
    x.user_id,
    coalesce(x.release_id, re.release_id) as release_id,
    0::int as minutes_played,
    coalesce(x.achievements_earned, 0)::int as earned,
    coalesce(x.achievements_total, 0)::int as total,
    coalesce(x.last_played_at, x.last_updated_at)::timestamptz as last_signal_at
  from xbox_title_progress x
  left join release_external_ids re
    on re.source = 'xbox'
   and re.external_id = x.title_id::text
  where x.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
    and coalesce(x.release_id, re.release_id) is not null
),
steam as (
  select
    s.user_id,
    s.release_id,
    coalesce(s.playtime_minutes, 0)::int as minutes_played,
    0::int as earned,
    0::int as total,
    s.last_updated_at::timestamptz as last_signal_at
  from steam_title_progress s
  where s.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
),
steam_fallback as (
  select
    pe.user_id,
    pe.release_id,
    coalesce(pe.playtime_minutes, 0)::int as minutes_played,
    0::int as earned,
    0::int as total,
    null::timestamptz as last_signal_at
  from portfolio_entries pe
  join releases r on r.id = pe.release_id and lower(r.platform_key) = 'steam'
  left join steam_title_progress s
    on s.user_id = pe.user_id and s.release_id = pe.release_id
  where pe.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
    and s.release_id is null
),
ra as (
  select
    rac.user_id,
    rac.release_id,
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
  where rac.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
),
signals_raw as (
  select * from psn
  union all select * from xbox
  union all select * from steam
  union all select * from steam_fallback
  union all select * from ra
),
signals as (
  select
    user_id,
    release_id,
    max(minutes_played) as minutes_played,
    max(earned) as earned,
    max(total) as total,
    max(last_signal_at) as last_signal_at
  from signals_raw
  group by user_id, release_id
),
-- Played-on label: strongest signal per release (PSN > Xbox > Steam > RA)
played_on_per_release as (
  select distinct on (release_id)
    release_id,
    case src
      when 'psn' then 'Played on: PlayStation'
      when 'xbox' then 'Played on: Xbox'
      when 'steam' then 'Played on: PC'
      when 'steam_fallback' then 'Played on: PC'
      when 'ra' then 'Played on: RetroAchievements'
    end as played_on
  from (
    select release_id, 'psn' as src, 1 as pri from psn
    union all select release_id, 'xbox', 2 from xbox
    union all select release_id, 'steam', 3 from steam
    union all select release_id, 'steam_fallback', 3 from steam_fallback
    union all select release_id, 'ra', 4 from ra
  ) t
  order by release_id, pri
),
scored as (
  select
    b.origin_bucket,
    b.release_id,
    b.game_id,
    b.display_title as title,
    b.cover_url,
    s.minutes_played,
    s.earned,
    s.total,
    s.last_signal_at,
    po.played_on,
    (
      (case when s.total > 0 then (s.earned::numeric / s.total::numeric) else 0 end) * 100
      + (coalesce(s.minutes_played,0)::numeric / 6000) * 10
      + (case when s.last_signal_at is not null then extract(epoch from s.last_signal_at) / 1e9 else 0 end)
    ) as score
  from bucketed b
  left join signals s
    on s.user_id = b.user_id and s.release_id = b.release_id
  left join played_on_per_release po on po.release_id = b.release_id
  where b.origin_bucket <> 'unknown'
),
ranked as (
  select
    *,
    row_number() over (partition by origin_bucket order by score desc nulls last) as rn
  from scored
)
select
  origin_bucket,
  jsonb_agg(jsonb_build_object(
    'release_id', release_id,
    'title', title,
    'cover_url', cover_url,
    'score', score,
    'played_on', played_on
  ) order by rn) as standout
from ranked
where rn <= 3
group by origin_bucket
order by origin_bucket;
