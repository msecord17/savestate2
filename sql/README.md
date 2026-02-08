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

## 4) Canonical identity + timeline (2026-02-06)

Run in order (Supabase SQL Editor or psql):

1. **`2026-02-06_add_game_external_ids.sql`** — table `game_external_ids(source, external_id → game_id)`. Sync resolves game first via this table, then release.
2. **`2026-02-06_add_games_igdb_category.sql`** — optional column `games.igdb_category` (0 = main_game). Required for timeline RPC non-game filter.
3. **`2026-02-06_add_games_match_audit.sql`** — match_status, match_confidence, match_method, match_query, match_debug, matched_at for deterministic + auditable IGDB matching.
4. **`2026-02-06_add_manual_igdb_overrides.sql`** — table `manual_igdb_overrides(source, external_id, igdb_game_id)`. Checked before IGDB matching; when set, game is resolved by this IGDB id only.
5. **`2026-02-06_add_game_match_attempts.sql`** — table `game_match_attempts` for audit/replay of platform→IGDB match attempts (confidence, reasons, outcome).
6. **`2026-02-06_add_game_matches.sql`** — table `game_matches` (match registry): proposed/accepted/rejected per game; one accepted per game_id; indexes on (source, source_title), (igdb_game_id).
7. **`2026-02-06_add_game_master_mappings.sql`** — table `game_master_mappings(platform_key, external_id, igdb_game_id, confidence, chosen_igdb_name, chosen_igdb_year, status, method)`. Sync looks up before IGDB; only write games.igdb_game_id when confidence >= 0.92; confirmed = never auto-change.
8. **`2026-02-06_add_game_title_aliases.sql`** — optional table `game_title_aliases(raw_title, canonical_title, search_title)` for lookup-first IGDB search.
9. **`2026-02-06_igdb_match_overrides_attempts_review.sql`** — spine fix: `igdb_match_overrides` (truth table), `igdb_match_attempts` (observability), `igdb_match_review_queue` (human-in-loop).
10. **`2026-02-06_get_origin_timeline_non_overlapping_buckets.sql`** — RPC `get_origin_timeline`: origin-era from `games.first_release_year`, standouts by game_id, filter by content_type + igdb_category + blocklist.

- **psql:** Run each `2026-02-06_*.sql` in the order above.
