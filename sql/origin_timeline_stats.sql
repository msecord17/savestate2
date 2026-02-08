-- Origin-era timeline stats for ONE user
-- Uses games.first_release_year (fallback to releases.release_date year)
-- Gen 5 split: 5a (32-bit dawn), 5b (64-bit wave)

with owned as (
  select
    pe.user_id,
    pe.release_id,
    r.game_id,
    r.platform_key,
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
    user_id,
    release_id,
    game_id,
    platform_key,
    origin_year,
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
)
select
  origin_bucket,
  count(distinct game_id)   as games,
  count(distinct release_id) as releases
from bucketed
where origin_bucket <> 'unknown'
group by origin_bucket
order by games desc;
