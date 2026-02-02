-- Enforce one release per (platform_key, game_id).
-- Run this AFTER you have run the bulk merge of duplicate releases
-- (POST /api/catalog/merge-release-duplicates?dry_run=0).

create unique index if not exists releases_platform_game_unique
on public.releases (platform_key, game_id);
