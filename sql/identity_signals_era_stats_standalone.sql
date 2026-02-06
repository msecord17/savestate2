-- Standalone query: era_stats, era_entropy, platform_stats, retro_modern.
-- Replace the user_id literal with your own, then run the whole script in Supabase SQL editor.

with
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
eras as (
  select
    user_id,
    era_bucket,
    count(distinct game_id) as games,
    count(distinct release_id) as releases
  from owned_with_era
  group by user_id, era_bucket
),
era_stats as (
  select
    user_id,
    sum(games) filter (where era_bucket <> 'unknown') as known_era_games,
    max(games) filter (where era_bucket <> 'unknown') as top_era_games,
    (array_agg(era_bucket order by games desc))[1] as top_era_bucket
  from eras
  group by user_id
),
era_entropy as (
  select
    e.user_id,
    coalesce(
      -1 * sum(
        (e.games::float / nullif(es.known_era_games, 0)) *
        ln(e.games::float / nullif(es.known_era_games, 0))
      ),
      0
    ) as era_entropy
  from eras e
  join era_stats es on es.user_id = e.user_id
  where e.era_bucket <> 'unknown' and es.known_era_games > 0
  group by e.user_id
),
platform_stats as (
  select
    user_id,
    max(cnt)::int as top_platform_releases,
    (array_agg(platform_key order by cnt desc))[1] as top_platform
  from (
    select user_id, platform_key, count(distinct release_id) as cnt
    from owned_with_era
    group by user_id, platform_key
  ) t
  group by user_id
),
retro_modern as (
  select
    user_id,
    count(distinct game_id) filter (where release_year is not null and release_year <= 2000) as retro_games,
    count(distinct game_id) filter (where release_year is not null and release_year >= 2013) as modern_games
  from owned_with_era
  group by user_id
)
select
  es.user_id,
  es.known_era_games,
  es.top_era_games,
  es.top_era_bucket,
  ee.era_entropy,
  ps.top_platform,
  ps.top_platform_releases,
  rm.retro_games,
  rm.modern_games
from era_stats es
left join era_entropy ee on ee.user_id = es.user_id
left join platform_stats ps on ps.user_id = es.user_id
left join retro_modern rm on rm.user_id = es.user_id;
