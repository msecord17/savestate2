-- View: one row per user with aggregated identity signals (library + era buckets + achievements/playtime).
-- Fix: releases has no first_release_year; use games.first_release_year and releases.release_date only.
-- Signals: unified from psn_title_progress, xbox_title_progress, steam_title_progress, ra_achievement_cache, portfolio_entries (Steam playtime).

create or replace view v_identity_signals as
with owned as (
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
),
owned_with_era as (
  select
    user_id, release_id, game_id, platform_key, release_year,
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
-- Per (user_id, release_id): summed achievements and playtime from PSN, Xbox, Steam, RA, portfolio_entries
ra_per_release as (
  select
    rac.user_id,
    rac.release_id,
    count(*) filter (where (elem->>'earned')::boolean = true)::int as earned,
    count(*)::int as total
  from ra_achievement_cache rac,
       jsonb_array_elements(rac.payload->'achievements') as elem
  group by rac.user_id, rac.release_id
),
pe_steam_minutes as (
  select pe.user_id, pe.release_id, coalesce(pe.playtime_minutes, 0) as playtime_minutes
  from portfolio_entries pe
  join releases r on r.id = pe.release_id and lower(r.platform_key) = 'steam'
),
signals as (
  select
    o.user_id,
    o.release_id,
    (coalesce(st.playtime_minutes, 0) + coalesce(psn.playtime_minutes, 0) + coalesce(pe_steam.playtime_minutes, 0))::int as minutes_played,
    (coalesce(psn.trophies_earned, 0) + coalesce(xb.achievements_earned, 0) + coalesce(ra.earned, 0))::int as achievements_earned,
    (coalesce(psn.trophies_total, 0) + coalesce(xb.achievements_total, 0) + coalesce(ra.total, 0))::int as achievements_total
  from owned o
  left join steam_title_progress st on st.release_id = o.release_id and st.user_id = o.user_id
  left join psn_title_progress psn on psn.release_id = o.release_id and psn.user_id = o.user_id
  left join xbox_title_progress xb on xb.release_id = o.release_id and xb.user_id = o.user_id
  left join ra_per_release ra on ra.release_id = o.release_id and ra.user_id = o.user_id
  left join pe_steam_minutes pe_steam on pe_steam.release_id = o.release_id and pe_steam.user_id = o.user_id
),
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
ach as (
  select
    o.user_id,
    coalesce(sum(s.achievements_earned), 0) as achievements_earned,
    coalesce(sum(s.achievements_total), 0) as achievements_total,
    coalesce(sum(s.minutes_played), 0) as minutes_played
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
    'achievements_earned', a.achievements_earned,
    'achievements_total', a.achievements_total,
    'minutes_played', a.minutes_played,
    'era_buckets', (
      select jsonb_object_agg(e.era_bucket, jsonb_build_object('games', e.games, 'releases', e.releases))
      from eras e
      where e.user_id = l.user_id
    )
  ) as identity_signals
from lib l
left join ach a on a.user_id = l.user_id;

comment on view v_identity_signals is 'One row per user: identity signals (library, era buckets, achievements/playtime) from portfolio_entries + releases + games + PSN/Xbox/Steam/RA progress.';
