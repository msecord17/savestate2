-- Identity RPCs for server-side compute (web/lib/identity/compute.ts).
-- Aggregates in SQL; returns one small row per RPC. Uses the same tables as
-- gamehome + profile score: portfolio_entries, releases, games,
-- psn_title_progress, xbox_title_progress, steam_title_progress, ra_achievement_cache.

-- 1) Platform coverage counts (portfolio_entries + releases by platform_key)
create or replace function public.identity_platform_counts(p_user_id uuid)
returns table (
  psn bigint,
  xbox bigint,
  steam bigint,
  ra bigint,
  platform_spread_score double precision
)
language sql
security definer
set search_path = public
stable
as $$
  with user_releases as (
    select pe.release_id, lower(r.platform_key) as platform_key
    from portfolio_entries pe
    join releases r on r.id = pe.release_id
    where pe.user_id = p_user_id
  ),
  by_platform as (
    select
      coalesce(count(*) filter (where platform_key = 'psn'), 0) as psn,
      coalesce(count(*) filter (where platform_key = 'xbox'), 0) as xbox,
      coalesce(count(*) filter (where platform_key = 'steam'), 0) as steam,
      coalesce(count(*) filter (where platform_key in ('ra', 'retroachievements')), 0) as ra
    from user_releases
  ),
  spread as (
    select
      (select psn from by_platform)::bigint,
      (select xbox from by_platform)::bigint,
      (select steam from by_platform)::bigint,
      (select ra from by_platform)::bigint,
      -- 0..1: 1 platform = 0.25, 4 platforms = 1
      least(1.0, (
        (case when (select psn from by_platform) > 0 then 1 else 0 end) +
        (case when (select xbox from by_platform) > 0 then 1 else 0 end) +
        (case when (select steam from by_platform) > 0 then 1 else 0 end) +
        (case when (select ra from by_platform) > 0 then 1 else 0 end)
      )::double precision / 4.0)
  )
  select * from spread;
$$;

comment on function public.identity_platform_counts(uuid) is 'Counts of user portfolio entries by platform (PSN/Xbox/Steam/RA) and 0..1 spread score for identity compute.';

-- 2) Trophy/achievement + playtime stats (same sources as gamehome and user-stats)
create or replace function public.identity_trophy_stats(p_user_id uuid)
returns table (
  completion_score double precision,
  playtime_score double precision,
  has_any_completion boolean
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  release_ids uuid[];
  trophies_earned bigint := 0;
  trophies_total bigint := 0;
  achievements_earned bigint := 0;
  achievements_total bigint := 0;
  ra_earned int := 0;
  ra_total int := 0;
  total_earned numeric := 0;
  total_possible numeric := 0;
  comp_score double precision := 0;
  play_minutes numeric := 0;
  play_score double precision := 0;
  has_completion boolean := false;
begin
  select array_agg(pe.release_id)
  into release_ids
  from portfolio_entries pe
  where pe.user_id = p_user_id;

  if release_ids is null or array_length(release_ids, 1) is null then
    return query select 0::double precision, 0::double precision, false;
    return;
  end if;

  -- PSN
  select coalesce(sum(psn.trophies_earned), 0), coalesce(sum(psn.trophies_total), 0)
  into trophies_earned, trophies_total
  from psn_title_progress psn
  where psn.user_id = p_user_id and psn.release_id = any(release_ids);

  -- Xbox
  select coalesce(sum(xb.achievements_earned), 0), coalesce(sum(xb.achievements_total), 0)
  into achievements_earned, achievements_total
  from xbox_title_progress xb
  where xb.user_id = p_user_id and xb.release_id = any(release_ids);

  -- RA: count from payload.achievements (earned vs total)
  with ra_counts as (
    select
      count(*) filter (where (elem->>'earned')::boolean = true) as earned,
      count(*) as total
    from ra_achievement_cache rac,
      jsonb_array_elements(rac.payload->'achievements') as elem
    where rac.user_id = p_user_id and rac.release_id = any(release_ids)
  )
  select coalesce(rc.earned, 0), coalesce(rc.total, 0) into ra_earned, ra_total from ra_counts rc;

  total_earned := trophies_earned + achievements_earned + ra_earned;
  total_possible := trophies_total + achievements_total + ra_total;
  if total_possible > 0 then
    comp_score := least(1.0, (total_earned::double precision / total_possible::double precision));
    has_completion := total_earned > 0;
  end if;

  -- Playtime: Steam (steam_title_progress) + PSN (psn_title_progress) + portfolio_entries.playtime_minutes for Steam releases
  select coalesce(sum(st.playtime_minutes), 0) into play_minutes from steam_title_progress st where st.user_id = p_user_id and st.release_id = any(release_ids);
  play_minutes := play_minutes + (select coalesce(sum(psn.playtime_minutes), 0) from psn_title_progress psn where psn.user_id = p_user_id and psn.release_id = any(release_ids));
  play_minutes := play_minutes + (
    select coalesce(sum(pe.playtime_minutes), 0)
    from portfolio_entries pe
    join releases r on r.id = pe.release_id and lower(r.platform_key) = 'steam'
    where pe.user_id = p_user_id and pe.release_id = any(release_ids)
  );
  -- Normalize to 0..1: ~500h = 1 (30000 min), cap at 1
  play_score := least(1.0, (play_minutes::double precision / 30000.0));

  return query select comp_score, play_score, has_completion;
end;
$$;

comment on function public.identity_trophy_stats(uuid) is 'Completion ratio (trophies+achievements+RA) and playtime score 0..1 for identity archetype compute.';

-- 3) Era anchor (weighted by portfolio releases → games.first_release_year)
create or replace function public.identity_era_anchor(p_user_id uuid)
returns table (era_key text)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  best_era text := 'modern';
  best_count int := 0;
  yr int;
  e text;
begin
  -- Map first_release_year to era key matching compute.ts eraDefs: atari, nes, snes, ps1, ps2, modern
  with years as (
    select g.first_release_year
    from portfolio_entries pe
    join releases r on r.id = pe.release_id
    left join games g on g.id = r.game_id
    where pe.user_id = p_user_id and g.id is not null
  ),
  eras as (
    select
      case
        when first_release_year is null or first_release_year <= 1985 then 'atari'
        when first_release_year <= 1990 then 'nes'
        when first_release_year <= 1995 then 'snes'
        when first_release_year <= 2000 then 'ps1'
        when first_release_year <= 2006 then 'ps2'
        else 'modern'
      end as era
    from years
  ),
  counted as (
    select era, count(*) as cnt
    from eras
    group by era
  )
  select counted.era, counted.cnt::int into best_era, best_count
  from counted
  order by counted.cnt desc
  limit 1;

  if best_era is null then
    best_era := 'modern';
  end if;

  return query select best_era;
end;
$$;

comment on function public.identity_era_anchor(uuid) is 'Primary era from portfolio releases first_release_year for identity compute.';
