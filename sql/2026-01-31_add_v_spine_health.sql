-- Single-row view for admin spine health: games/releases counts and enrichment gaps.
-- Used by GET /api/admin/spine-health.

create or replace view public.v_spine_health as
select
  (select count(*) from public.games) as games_total,
  (select count(*) from public.games where igdb_game_id is not null) as games_with_igdb,
  (select count(*) from public.games where cover_url is not null and cover_url <> '') as games_with_cover,
  (select count(*) from public.releases) as releases_total,
  (select count(*) from public.release_enrichment_state res
   join public.releases r on r.id = res.release_id
   join public.games g on g.id = r.game_id
   where g.igdb_game_id is null) as releases_pending_igdb,
  (select count(*) from public.release_enrichment_state res
   join public.releases r on r.id = res.release_id
   join public.games g on g.id = r.game_id
   where (g.cover_url is null or g.cover_url = '') and (r.cover_url is null or r.cover_url = '')) as releases_pending_cover,
  (select count(*) from public.release_enrichment_state where attempt_count >= 3) as releases_enrichment_failed;

comment on view public.v_spine_health is 'Admin health: aggregate counts for games, releases, and enrichment state (used by /api/admin/spine-health).';
