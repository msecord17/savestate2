-- Single-row RPC for identity archetype scorer (lib/identity/archetypes.ts).
-- Returns IdentitySignals shape: owned_titles, unique_platforms, era_span_years,
-- primary_era_share, primary_era_count, achievements_total, completion_count, achievements_last_90d, era_key.

create or replace function public.identity_signals(p_user_id uuid)
returns table (
  owned_titles bigint,
  unique_platforms int,
  era_span_years int,
  primary_era_share double precision,
  primary_era_count bigint,
  achievements_total bigint,
  completion_count bigint,
  achievements_last_90d bigint,
  era_key text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_owned bigint := 0;
  v_platforms int := 0;
  v_span int := 0;
  v_share double precision := 0;
  v_era_count bigint := 0;
  v_era_key text := 'modern';
  v_achievements bigint := 0;
  v_completion bigint := 0;
  v_90d bigint := 0;
  v_total_era bigint := 0;
begin
  -- owned_titles: count of portfolio entries (distinct releases)
  select count(*) into v_owned from portfolio_entries pe where pe.user_id = p_user_id;

  -- unique_platforms: distinct platform_key from user's releases
  with user_rels as (
    select distinct lower(r.platform_key) as pk
    from portfolio_entries pe
    join releases r on r.id = pe.release_id
    where pe.user_id = p_user_id
  ),
  norm as (
    select case when pk in ('ra', 'retroachievements') then 'ra' else pk end as platform_key
    from user_rels
  )
  select count(distinct platform_key)::int into v_platforms from norm;

  -- era buckets + primary_era_share, primary_era_count, era_key, era_span_years
  with years as (
    select g.first_release_year as yr
    from portfolio_entries pe
    join releases r on r.id = pe.release_id
    left join games g on g.id = r.game_id
    where pe.user_id = p_user_id and g.id is not null
  ),
  eras as (
    select
      case
        when yr is null or yr <= 1985 then 'atari'
        when yr <= 1990 then 'nes'
        when yr <= 1995 then 'snes'
        when yr <= 2000 then 'ps1'
        when yr <= 2006 then 'ps2'
        else 'modern'
      end as era
    from years
  ),
  era_counts as (
    select era, count(*) as cnt from eras group by era
  ),
  total_era as (
    select sum(cnt)::bigint as t from era_counts
  ),
  best as (
    select era, cnt from era_counts order by cnt desc limit 1
  )
  select
    (select t from total_era),
    (select cnt from best)
  into v_total_era, v_era_count;

  select era into v_era_key from (
    select era from era_counts order by cnt desc limit 1
  ) x;
  if v_era_key is null then v_era_key := 'modern'; end if;

  if v_total_era > 0 then
    v_share := v_era_count::double precision / v_total_era::double precision;
  end if;

  -- era_span_years: max - min year
  with years as (
    select g.first_release_year as yr
    from portfolio_entries pe
    join releases r on r.id = pe.release_id
    left join games g on g.id = r.game_id
    where pe.user_id = p_user_id and g.id is not null and g.first_release_year is not null
  )
  select coalesce(max(yr), 0) - coalesce(min(yr), 0) into v_span from years;

  -- achievements_total: trophies + xbox achievements + ra earned (raw counts)
  with release_ids as (select release_id from portfolio_entries where user_id = p_user_id),
  psn as (select coalesce(sum(psn.trophies_earned), 0)::bigint as n from psn_title_progress psn where psn.user_id = p_user_id and psn.release_id in (select release_id from release_ids)),
  xb as (select coalesce(sum(xb.achievements_earned), 0)::bigint as n from xbox_title_progress xb where xb.user_id = p_user_id and xb.release_id in (select release_id from release_ids)),
  ra as (
    select coalesce(count(*), 0)::bigint as n
    from ra_achievement_cache rac, jsonb_array_elements(rac.payload->'achievements') elem
    where rac.user_id = p_user_id and rac.release_id in (select release_id from release_ids)
      and (elem->>'earned')::boolean = true
  )
  select (select n from psn) + (select n from xb) + (select n from ra) into v_achievements;

  -- completion_count: titles with 100% trophy/achievement progress (optional)
  with release_ids as (select release_id from portfolio_entries where user_id = p_user_id),
  psn_done as (
    select count(*)::bigint as n from psn_title_progress psn
    where psn.user_id = p_user_id and psn.release_id in (select release_id from release_ids)
      and psn.trophies_total > 0 and psn.trophies_earned >= psn.trophies_total
  ),
  xb_done as (
    select count(*)::bigint as n from xbox_title_progress xb
    where xb.user_id = p_user_id and xb.release_id in (select release_id from release_ids)
      and xb.achievements_total > 0 and xb.achievements_earned >= xb.achievements_total
  )
  select (select n from psn_done) + (select n from xb_done) into v_completion;

  -- achievements_last_90d: placeholder 0 (would need earned_at on achievements)
  v_90d := 0;

  return query select
    v_owned,
    v_platforms,
    v_span,
    v_share,
    v_era_count,
    v_achievements,
    v_completion,
    v_90d,
    v_era_key;
end;
$$;

comment on function public.identity_signals(uuid) is 'Single row of IdentitySignals for archetype scorer (owned_titles, unique_platforms, era_*, achievements_total, etc.).';
