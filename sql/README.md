# DB spine: run order

**Only after bulk repair, run the index migrations.** If collisions exist, indexes will fail; repair first.

## 1) Bulk repair (API, run while app is up)

- **Duplicate releases** (same platform external id → multiple release rows):  
  `POST /api/catalog/merge-release-duplicates?dry_run=0`
- **Duplicate games** (same igdb_game_id → multiple game rows):  
  `POST /api/catalog/dedupe-igdb-games?dry_run=0`

Run each with `dry_run=1` first to preview, then `dry_run=0` to apply.

## 2) Indexes (Supabase SQL Editor)

Run in this order:

1. `2026-01-29_add_unique_games_igdb_game_id.sql` — unique `games(igdb_game_id)` where not null  
2. `2026-01-29_add_unique_releases_platform_game.sql` — unique `releases(platform_key, game_id)`  
3. `2026-01-29_add_unique_release_external_ids.sql` — unique `release_external_ids(source, external_id)`

These lock the spine so sync stays idempotent by construction.

## 3) Steam thin sync + enrichment (2026-01-31)

Run in order:

1. `2026-01-31_add_release_enrichment_state.sql`
2. `2026-01-31_release_enrichment_state_flags.sql`
3. `2026-01-31_add_games_content_type.sql`
4. `2026-01-31_add_v_spine_health.sql` — view for `GET /api/admin/spine-health`
