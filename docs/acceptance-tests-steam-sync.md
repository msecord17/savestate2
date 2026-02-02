# Acceptance tests: Steam sync (2,000+ games)

## Scope

- **Thin sync:** library + playtime + last played + mappings; no IGDB; no achievements.
- **Enrichment:** priority (most played first) then longtail; resumable via cursor.
- **Idempotency:** re-running thin sync creates zero duplicates.

---

## 1. User with 2,000 Steam games

### 1.1 Thin sync returns in < 60s and UI shows library immediately

| Step | Action | Expected |
|------|--------|----------|
| 1 | User has 2,000 owned games in Steam (or mock). | — |
| 2 | User triggers thin sync (e.g. Steam Sync page → "Run Steam Sync (thin)"). | — |
| 3 | Wait for sync to complete. | Response returns in **< 60 seconds**. |
| 4 | Open Game Home or library view. | **Library shows immediately** (paginated; first 50 items). No long blank load. |

**Notes:** Thin sync does one Steam API call and then only DB writes (mapping → game/release → progress → portfolio → enrichment_state). No IGDB calls.

### 1.2 No IGDB calls during thin sync

| Step | Action | Expected |
|------|--------|----------|
| 1 | (Optional) Monitor network or stub `fetch` to `api.igdb.com`. | — |
| 2 | Run thin sync for a user with many games. | **Zero** requests to `api.igdb.com` (or to IGDB API). |
| 3 | Thin sync uses only `ensureGameTitleOnly` (title-only game create). | No `upsertGameIgdbFirst` / `igdbSearchBest` during thin sync. |

**Implementation:** Thin sync route imports and uses only `ensureGameTitleOnly` from `@/lib/igdb/server`; it never calls `upsertGameIgdbFirst` or any IGDB search.

---

## 2. Enrich priority

### 2.1 First 100 most played get covers + igdb_game_id

| Step | Action | Expected |
|------|--------|----------|
| 1 | After thin sync, enrichment runs once (e.g. auto-call or "Continue enriching" with priority). | — |
| 2 | Call `POST /api/sync/steam-enrich?mode=priority&limit=100`. | Response: `processed`, `enriched`, `skipped`, `failed`; `next_cursor` and `has_more` as appropriate. |
| 3 | Check DB or UI for the user’s top 100 releases by playtime. | Those releases have `releases.cover_url` and/or `games.cover_url` set where IGDB returned art; `games.igdb_game_id` set where IGDB matched. |
| 4 | `release_enrichment_state` for those releases. | `has_igdb` and `has_cover` updated for enriched items. |

**Notes:** Priority mode orders by `portfolio_entries.playtime_minutes` desc, then `last_played_at` desc. First 100 in that order are candidates for enrichment (subject to attempt_count and content_type guardrails).

---

## 3. Longtail

### 3.1 Can run repeatedly until has_more = false

| Step | Action | Expected |
|------|--------|----------|
| 1 | Call `POST /api/sync/steam-enrich?mode=longtail&limit=100` (no cursor). | Response includes `next_cursor` and `has_more`. |
| 2 | If `has_more === true`, call again with `cursor=<next_cursor>`. | Same shape; may return fewer than 100 processed. |
| 3 | Repeat until `has_more === false`. | Eventually `has_more === false` and `next_cursor` can be null. No infinite loop. |

**Notes:** Longtail orders by `releases.id` asc and uses cursor pagination. Each run processes up to `limit` candidates that are not yet fully enriched (has_igdb + has_cover).

---

## 4. Re-running thin sync

### 4.1 Creates zero duplicates

| Step | Action | Expected |
|------|--------|----------|
| 1 | Run thin sync for a user; note counts (e.g. `releases_created`, `portfolio_upserted`, total releases for that user). | — |
| 2 | Run thin sync again with the same Steam library (no new games). | **Zero** new releases: `releases_created === 0`. Portfolio and progress are updated in place (same release_ids). |
| 3 | Check `release_external_ids` for Steam. | One row per (source='steam', external_id=appid); no duplicate release_ids for the same appid. |
| 4 | Check `releases` and `portfolio_entries`. | No duplicate releases per (platform_key, game_id); no duplicate portfolio_entries per (user_id, release_id). |

**Implementation:** Idempotency is enforced by: (1) lookup `release_external_ids(source='steam', external_id=appid)` first; (2) only create release/game when no mapping exists; (3) upsert progress and portfolio by (user_id, release_id); (4) unique constraints on `release_external_ids(source, external_id)` and `releases(platform_key, game_id)`.

---

## Automated tests

Runnable acceptance tests (Vitest) live under `web/__tests__/acceptance/`. They use mocks for Steam API and Supabase to assert:

- Thin sync with 2,000 games: response ok, no fetch to IGDB, completion in under 60s (or under a relaxed threshold in CI).
- Thin sync uses only `ensureGameTitleOnly` (no IGDB search).
- Re-run thin sync with same data: second run creates zero new releases (mock Supabase returns existing mappings).
- Enrich priority returns expected shape; longtail with cursor can be called until `has_more === false`.

**Run:** From repo root: `cd web && npm install && npm run test` (or `npm run test:watch` for watch mode).
