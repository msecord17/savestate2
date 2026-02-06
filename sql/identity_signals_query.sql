-- Identity signals for a user. Uses correct tables:
-- - portfolio_entries, releases, games (no releases.first_release_year)
-- - psn_title_progress (np_communication_id → release via release_external_ids)
-- - xbox_title_progress (title_id → release via release_external_ids)
-- - steam_title_progress + portfolio_entries.playtime_minutes for Steam fallback
-- - ra_achievement_cache (payload->achievements)
--
-- Spine tightness:
-- 1) Dedupe step (signals CTE): a single release can have multiple signal rows
--    (e.g. PSN + RA for a retro title, or Steam + steam_fallback). Group by
--    (user_id, release_id) with max() prevents double-counting. For "source
--    preference" later (e.g. PSN over RA), switch to ranking and pick one row per release.
-- 2) release_external_ids join: coalesce(progress.release_id, re.release_id) lets
--    any title with an external mapping contribute to identity even when the
--    progress row hasn't been backfilled with release_id yet.

with
-- =========================
-- 1) OWNED LIBRARY (spine)
-- =========================
owned as (
  select
    pe.user_id,
    pe.release_id,
    r.game_id,
    r.platform_key,
    coalesce(
      g.first_release_year,
      case when r.release_date is not null then extract(year from r.release_date)::int end
    ) as release_year
  from portfolio_entries pe
  join releases r on r.id = pe.release_id
  left join games g on g.id = r.game_id
  where pe.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
),

owned_with_era as (
  select
    user_id,
    release_id,
    game_id,
    platform_key,
    release_year,
    case
      when release_year is null then 'unknown'
      when release_year <= 1979 then 'early_arcade_pre_crash'
      when release_year between 1980 and 1989 then '8bit_home'
      when release_year between 1990 and 1995 then '16bit'
      when release_year between 1996 and 2000 then '32_64bit'
      when release_year between 2001 and 2005 then 'ps2_xbox_gc'
      when release_year between 2006 and 2012 then 'hd_era'
      when release_year between 2013 and 2016 then 'ps4_xbo'
      when release_year between 2017 and 2019 then 'switch_wave'
      when release_year >= 2020 then 'modern'
      else 'unknown'
    end as era_bucket
  from owned
),

-- ==========================================
-- 2) SIGNALS: map -> (user_id, release_id)
--    PSN/Xbox: join release_external_ids so titles count even if progress.release_id not yet backfilled.
-- ==========================================
psn_signals as (
  select
    p.user_id,
    coalesce(
      p.release_id,
      re.release_id
    ) as release_id,
    coalesce(p.playtime_minutes, 0) as minutes_played,
    coalesce(p.trophies_earned, 0) as achievements_earned,
    coalesce(p.trophies_total, 0) as achievements_total
  from psn_title_progress p
  left join release_external_ids re
    on re.source = 'psn'
   and re.external_id = p.np_communication_id::text
  where p.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
    and coalesce(p.release_id, re.release_id) is not null
),

xbox_signals as (
  select
    x.user_id,
    coalesce(
      x.release_id,
      re.release_id
    ) as release_id,
    0::int as minutes_played,
    coalesce(x.achievements_earned, 0) as achievements_earned,
    coalesce(x.achievements_total, 0) as achievements_total
  from xbox_title_progress x
  left join release_external_ids re
    on re.source = 'xbox'
   and re.external_id = x.title_id::text
  where x.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
    and coalesce(x.release_id, re.release_id) is not null
),

steam_signals as (
  select
    s.user_id,
    s.release_id,
    coalesce(s.playtime_minutes, 0) as minutes_played,
    0::int as achievements_earned,
    0::int as achievements_total
  from steam_title_progress s
  where s.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
    and s.release_id is not null
),

-- Steam fallback: portfolio_entries.playtime_minutes for Steam releases when steam_title_progress row is missing
steam_fallback_signals as (
  select
    pe.user_id,
    pe.release_id,
    coalesce(pe.playtime_minutes, 0)::int as minutes_played,
    0::int as achievements_earned,
    0::int as achievements_total
  from portfolio_entries pe
  join releases r on r.id = pe.release_id and lower(r.platform_key) = 'steam'
  left join steam_title_progress s
    on s.user_id = pe.user_id and s.release_id = pe.release_id
  where pe.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
    and s.release_id is null
    and pe.release_id is not null
),

ra_signals as (
  select
    rac.user_id,
    rac.release_id,
    0::int as minutes_played,
    coalesce((
      select count(*)
      from jsonb_array_elements(coalesce(rac.payload->'achievements','[]'::jsonb)) a
      where (a->>'earned')::boolean = true
    ), 0)::int as achievements_earned,
    coalesce((
      select count(*)
      from jsonb_array_elements(coalesce(rac.payload->'achievements','[]'::jsonb)) a
    ), 0)::int as achievements_total
  from ra_achievement_cache rac
  where rac.user_id = '4eb4629d-58da-43fa-835b-d9bc9f0adc67'
    and rac.release_id is not null
),

-- Union all signals (same release can appear from multiple sources)
signals_raw as (
  select * from psn_signals
  union all
  select * from xbox_signals
  union all
  select * from steam_signals
  union all
  select * from steam_fallback_signals
  union all
  select * from ra_signals
),

-- Deduplicate: one row per (user_id, release_id) using max() to avoid double-counting
-- when multiple sources contribute (e.g. PSN + RA, or steam_title_progress + fallback).
signals as (
  select
    user_id,
    release_id,
    max(minutes_played)::int as minutes_played,
    max(achievements_earned)::int as achievements_earned,
    max(achievements_total)::int as achievements_total
  from signals_raw
  group by user_id, release_id
),

-- =================================
-- 3) Aggregate identity metrics
-- =================================
lib as (
  select
    user_id,
    count(*) as owned_entries,
    count(distinct release_id) as owned_releases,
    count(distinct game_id) as owned_games,
    count(distinct platform_key) as unique_platforms,
    count(*) filter (where era_bucket <> 'unknown') as owned_with_known_era
  from owned_with_era
  group by user_id
),

eras as (
  select
    user_id,
    era_bucket,
    count(distinct game_id) as games,
    count(distinct release_id) as releases
  from owned_with_era
  group by user_id, era_bucket
),

sig_totals as (
  select
    o.user_id,
    coalesce(sum(s.achievements_earned), 0)::int as achievements_earned,
    coalesce(sum(s.achievements_total), 0)::int as achievements_total,
    coalesce(sum(s.minutes_played), 0)::int as minutes_played
  from owned o
  left join signals s
    on s.user_id = o.user_id and s.release_id = o.release_id
  group by o.user_id
)

select
  l.user_id,
  jsonb_build_object(
    'owned_entries', l.owned_entries,
    'owned_releases', l.owned_releases,
    'owned_games', l.owned_games,
    'unique_platforms', l.unique_platforms,
    'owned_with_known_era', l.owned_with_known_era,
    'achievements_earned', st.achievements_earned,
    'achievements_total', st.achievements_total,
    'minutes_played', st.minutes_played,
    'era_buckets', (
      select jsonb_object_agg(e.era_bucket, jsonb_build_object('games', e.games, 'releases', e.releases))
      from eras e
      where e.user_id = l.user_id
    )
  ) as identity_signals
from lib l
left join sig_totals st on st.user_id = l.user_id;
