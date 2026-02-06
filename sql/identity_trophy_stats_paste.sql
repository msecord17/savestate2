-- Paste this into Supabase SQL Editor. Uses your real tables:
-- portfolio_entries, releases, psn_title_progress, xbox_title_progress,
-- steam_title_progress, ra_achievement_cache

create or replace function public.identity_trophy_stats(p_user_id uuid)
returns table (
  completion_score float,
  playtime_score float,
  has_any_completion boolean
)
language sql
security definer
set search_path = public
stable
as $$
  with
  user_releases as (
    select pe.release_id
    from portfolio_entries pe
    where pe.user_id = p_user_id
  ),
  psn as (
    select
      coalesce(sum(psn.trophies_earned), 0)::bigint as earned,
      coalesce(sum(psn.trophies_total), 0)::bigint as total
    from psn_title_progress psn
    where psn.user_id = p_user_id
      and psn.release_id in (select release_id from user_releases)
  ),
  xbox as (
    select
      coalesce(sum(xb.achievements_earned), 0)::bigint as earned,
      coalesce(sum(xb.achievements_total), 0)::bigint as total
    from xbox_title_progress xb
    where xb.user_id = p_user_id
      and xb.release_id in (select release_id from user_releases)
  ),
  ra as (
    select
      count(*) filter (where (elem->>'earned')::boolean = true)::int as earned,
      count(*)::int as total
    from ra_achievement_cache rac,
         jsonb_array_elements(rac.payload->'achievements') as elem
    where rac.user_id = p_user_id
      and rac.release_id in (select release_id from user_releases)
  ),
  completion as (
    select
      (select earned from psn) + (select earned from xbox) + coalesce((select earned from ra), 0) as total_earned,
      (select total from psn) + (select total from xbox) + coalesce((select total from ra), 0) as total_possible
  ),
  playtime as (
    select coalesce(
      (select sum(st.playtime_minutes) from steam_title_progress st
       where st.user_id = p_user_id and st.release_id in (select release_id from user_releases))
      + (select sum(psn.playtime_minutes) from psn_title_progress psn
         where psn.user_id = p_user_id and psn.release_id in (select release_id from user_releases))
      + (select sum(pe.playtime_minutes) from portfolio_entries pe
         join releases r on r.id = pe.release_id and lower(r.platform_key) = 'steam'
         where pe.user_id = p_user_id and pe.release_id in (select release_id from user_releases)),
      0
    )::float as total_minutes
  )
  select
    case
      when (select total_possible from completion) > 0
      then least(1.0, (select total_earned from completion)::float / (select total_possible from completion)::float)
      else 0.0
    end as completion_score,
    least(1.0, (select total_minutes from playtime) / 30000.0) as playtime_score,
    coalesce((select total_earned from completion) > 0 and (select total_possible from completion) > 0, false) as has_any_completion;
$$;

comment on function public.identity_trophy_stats(uuid) is 'Completion (PSN+Xbox+RA) and playtime (Steam+PSN+portfolio) for identity compute.';
