# Platform sync sanity check (for sharing back)

**Philosophy we enforce**

- **IGDB** = canonical identity for games (when available).
- **Platform IDs** = identity for releases + `release_external_ids`. Table has columns `release_id`, `source`, `external_id` only.
- **Titles** = labels only, never the primary key; `canonical_title` is normalized (strip ™® etc.).
- **Rendering** = prefer `games.cover_url` (IGDB canonical), then `release.cover_url` (platform fallback), then placeholder (see `resolveCoverUrl`). RA must never write `games.cover_url` or `releases.cover_url`.

---

## 🔒 Spine rule: never overwrite a good IGDB match

**A. Do not overwrite good art (everywhere we backfill):**

- **If `games.igdb_game_id` IS NOT NULL → don’t re-search IGDB.** Implemented: `upsertGameIgdbFirst()` early-returns when a game with that `canonical_title` already has `igdb_game_id` set.
- **If `games.cover_url` IS NOT NULL and `images_source LIKE 'igdb%'` → don’t overwrite.** Implemented: `shouldOverwriteCover(current, imagesSource)` in `web/lib/igdb/server.ts`; we never overwrite when `imagesSource` matches `^igdb`; otherwise only overwrite when current is null or contains `unknown.png`/`placeholder`. (Add `images_source` to game select when the column exists.)
- **Only search IGDB when:** `igdb_game_id IS NULL` **and** `cover_url IS NULL` (for cover backfill). Resolver and backfill routes enforce this.

**B. Ignore list for non-games:**

- Xbox (and others) import apps/demos/utility titles that IGDB won’t have. Before IGDB search/backfill, skip if title matches (case-insensitive):  
  `amazon|netflix|hulu|spotify|iheartradio|movies|tv|groove|app|demo|trial|beta|pack|add-on|dlc|season pass|soundtrack`  
  Implemented: `isLikelyNonGame(title)` in `web/lib/igdb/server.ts`. Used in `upsertGameIgdbFirst` (no search when true), `backfill-covers`, `backfill-igdb-ids`. Tune the pattern over time.

**Where enforced:** `upsertGameIgdbFirst` (early return + non-game skip), `shouldOverwriteCover` (all game cover updates), `backfill-covers` and `backfill-igdb-ids` (filter non-games), sync/enrich routes (only search when `igdb_game_id` IS NULL).

---

## File map

| Platform | Primary sync / create path | Other relevant |
|----------|----------------------------|-----------------|
| **PSN**  | `web/app/api/sync/psn/route.ts` | `web/app/api/psn/import/route.ts`, `web/app/api/psn/map/route.ts` |
| **Steam**| `web/app/api/sync/steam-thin/route.ts` **(default)** | `web/app/api/sync/steam/route.ts` (full, debugging only), `web/app/api/steam/sync/route.ts` (lighter, debugging only) |
| **Xbox** | `web/app/api/sync/xbox/route.ts` | `web/app/api/auth/xbox/import/route.ts` |
| **RA**   | `web/lib/ra/map-release.ts` (mapping only) | `web/app/api/ra/map-release/route.ts`, achievements routes |

Shared game resolution lives in **`web/lib/igdb/server.ts`**: `upsertGameIgdbFirst()` (find by `igdb_game_id` → else find by normalized `canonical_title` → else insert; no upsert on `canonical_title`).

---

## PSN ✅

- **`sync/psn/route.ts`**: Uses shared `upsertGameIgdbFirst()` from `@/lib/igdb/server` (same 3-step + 23505 fallback). Writes `release_external_ids(source='psn', external_id)`. Normalizes `canonical_title` via `normalizeCanonicalTitle()`. No `onConflict: "canonical_title"` upsert.
- **`psn/import/route.ts`**, **`psn/map/route.ts`**: Same pattern (IGDB-first, normalized canonical_title, lookup-then-update-or-insert for games).

**Verdict:** Matches the philosophy.

---

## Steam

**Thin sync (default) — `web/app/api/sync/steam-thin/route.ts` ✅**

- **(0)** Anchor: `release_external_ids(source='steam', external_id=appid)` → use `release_id` if exists.
- **(1)** If no mapping: `ensureGameTitleOnly(title)` (no IGDB). **(2)** Find/create release by `(platform_key='steam', game_id)`. **(3)** Upsert mapping. **(4)** Update steam_title_progress, portfolio_entries, release_enrichment_state.
- No IGDB calls; enrichment runs separately (steam-enrich).

**Full sync (debugging only) — `web/app/api/sync/steam/route.ts` ✅**

- **(0)** Anchor: `release_external_ids(source='steam', external_id=appid)` → return if exists.
- **(1)** `upsertGameIgdbFirst(title)` → game_id. **(2)** Find release by `(platform_key='steam', game_id)`. **(3)** Insert with 23505 race handling. **(4)** Upsert mapping with `ignoreDuplicates: true`; if mapped `release_id` differs, merge via `mergeReleaseInto()`.
- Optional IGDB enrichment for existing rows (fill `igdb_game_id` when missing).

**Lighter sync (debugging only) — `web/app/api/steam/sync/route.ts` ✅**

- Same create-release pattern as full: appid anchor first, then game_id, find by (platform_key, game_id), insert with 23505, upsert mapping with ignoreDuplicates + merge when mapped release_id differs.
- for “spine dialed in” you’d replace this block with the same 3-step pattern (find by igdb_game_id → find by normalized canonical_title → insert) to avoid `onConflict: "canonical_title"` and align with PSN.

**Verdict:** Use **steam-thin** as the default; full and lighter are for debugging only. All use release_external_ids as authority (resolve release_id from appid first).

---

## Xbox ✅

- **`sync/xbox/route.ts`**: **(0)** Anchor: `release_external_ids(source='xbox', external_id=titleId)` → return if exists. **(1)** `upsertGameIgdbFirst(title)` → game_id. **(2)** Find release by `(platform_key='xbox', game_id)`. **(3)** Insert with 23505 race handling. **(4)** Upsert mapping with `ignoreDuplicates: true`; if mapped `release_id` differs, merge via `mergeReleaseInto()`.
- **`auth/xbox/import/route.ts`**: When creating game, uses **normalized** `canonical_title` (no IGDB in that path; lookup/insert by `normalizeCanonicalTitle(title)`). Elsewhere it can backfill `igdb_game_id` from `igdbSearchBest(title)` when updating an existing game.

**Verdict:** Matches the philosophy; sync uses same anchor-then-create pattern as PSN/Steam.

---

## RetroAchievements ✅

- **`web/lib/ra/map-release.ts`**: Only touches **`release_external_ids`** (upsert `release_id`, `source='ra'`, `external_id=raGameId`) and **`ra_game_list_cache`**. Does **not** create or update **games** or **releases** — RA maps onto existing releases only.
- RA routes must **not** write `games.cover_url` or `releases.cover_url`; RA images are achievement UI art, not canonical box art. Cover precedence is game (IGDB) first, then release, then placeholder.
- Flow: resolve RA console id → find RA game id → upsert `release_external_ids`. All keyed off existing `release_id`.

**Verdict:** RA is signal/mapping only; no create-release path; no cover writes. Correct.

---

## DB constraints (already in repo)

- **`sql/2026-01-29_add_unique_games_igdb_game_id.sql`** — unique `games(igdb_game_id)` where not null.
- **`sql/2026-01-29_add_unique_releases_platform_game.sql`** — unique `releases(platform_key, game_id)`.
- **`sql/2026-01-29_add_unique_release_external_ids.sql`** — unique `release_external_ids(source, external_id)`.

Run after bulk repair (merge duplicate releases, dedupe games). **After PSN repair** (ensureReleaseForPsnTitle now anchors on `release_external_ids` and merges on conflict), add **UNIQUE(releases.platform_key, releases.game_id)** via `sql/2026-01-29_add_unique_releases_platform_game.sql`. See `sql/README.md`.

---

## release_external_ids table columns

| Column       | Type   | Notes |
|-------------|--------|--------|
| release_id  | uuid   | FK to releases.id |
| source      | text   | e.g. `'psn'`, `'steam'`, `'xbox'`, `'ra'` |
| external_id | text   | Platform’s id (npCommunicationId, appid, titleId, raGameId, etc.) |

Unique on `(source, external_id)`. Only these three columns exist. If the schema cache warns about a missing column, ensure code and generated types use only `release_id`, `source`, `external_id`; use `releaseExternalIdRow()` for writes and explicit column lists for selects.

---

## PSN release creation/upsert block

From `web/app/api/sync/psn/route.ts` — `ensureReleaseForPsnTitle()`. **(0)** Lookup `release_external_ids(source='psn', external_id)` and return if exists. **(1)** `upsertGameIgdbFirst(titleName)` → game_id. **(2)** Find release by `(platform_key='psn', game_id)`. **(3)** If none, insert release with 23505 race handling (on unique violation, select by platform_key+game_id). **(4)** Upsert `release_external_ids` with `ignoreDuplicates: true`; if the mapped `release_id` differs from ours, merge our release into the mapped one (portfolio + signals + release_external_ids), delete ours, return mapped.

```ts
// (0) Anchor first
const { data: mapRow } = await admin.from("release_external_ids").select("release_id").eq("source", "psn").eq("external_id", psnExternalId).maybeSingle();
if (mapRow?.release_id) return String(mapRow.release_id);

// (1) game_id
const { game_id: gameId } = await upsertGameIgdbFirst(admin, titleName);

// (2) Find by (platform_key, game_id)
const { data: existingByGame } = await admin.from("releases").select("id").eq("platform_key", "psn").eq("game_id", gameId).maybeSingle();
if (existingByGame?.id) releaseId = String(existingByGame.id);
else {
  // (3) Insert with 23505 handling
  const { data: releaseRow, error: rErr } = await admin.from("releases").insert({ game_id: gameId, display_title: titleName.trim(), platform_key: "psn", platform_name: "PlayStation", platform_label: platformLabel, cover_url: null }).select("id").single();
  if (rErr?.code === "23505") { const { data: raced } = await admin.from("releases").select("id").eq("platform_key", "psn").eq("game_id", gameId).maybeSingle(); releaseId = String(raced.id); }
  else releaseId = String(releaseRow.id);
}

// (4) Upsert mapping (ignoreDuplicates); if mapped release_id !== releaseId, merge releaseId into mapped and return mapped
await admin.from("release_external_ids").upsert(releaseExternalIdRow(releaseId, "psn", psnExternalId), { onConflict: "source,external_id", ignoreDuplicates: true });
const { data: currentMap } = await admin.from("release_external_ids").select("release_id").eq("source", "psn").eq("external_id", psnExternalId).maybeSingle();
if (currentMap?.release_id && String(currentMap.release_id) !== releaseId) {
  await mergeReleaseInto(admin, String(currentMap.release_id), releaseId);
  return String(currentMap.release_id);
}
return releaseId;
```

---

## PSN release canonicalizer (repair job)

**Route:** `POST /api/catalog/psn-canonicalizer` (optional: `?dry_run=1`, `?limit_groups=100`).

For each `release_external_ids` where `source='psn'`, the referenced `release_id` is the **truth anchor** (canonical release). The job:

1. Ensures that release has `game_id` (via IGDB-first on `display_title`) and `platform_key='psn'`.
2. Finds any other releases with the same `(platform_key='psn', game_id)`.
3. Moves portfolio + signal rows to the canonical release, merges `release_external_ids` onto it, then deletes duplicate releases.

Same merge logic as the Diablo-style merge (portfolio, psn_title_progress, xbox_title_progress, steam_title_progress, ra_achievement_cache, release_external_ids). Run with `dry_run=1` first, then `dry_run=0`.

---

## Cover precedence and backfill safety

- **Rendering:** Use `game?.cover_url || release?.cover_url || placeholder` everywhere (enforced in `resolveCoverUrl`: game first, then release). RA and other provider art must never win over IGDB.
- **RA:** RA routes must not write `games.cover_url` or `releases.cover_url`; only `release_external_ids(source='ra')` and achievement caches.
- **IGDB wins guard:** In `upsertGameIgdbFirst` (and thus in the IGDB backfill route), we only overwrite `games.cover_url` when the current value is null or placeholder/known-bad. If a game already has a valid IGDB cover, we do not overwrite it with new art.

---

## TL;DR for sharing back

- **PSN:** IGDB-first + normalized canonical_title; no brittle title upsert. ✅  
- **Steam (full):** Same; platform ID → release; then IGDB game resolution when creating. ✅  
- **Steam (lighter):** Same resolver as full sync (`upsertGameIgdbFirst`); no title upsert. ✅  
- **Xbox:** IGDB-first where used; canonical titles normalized. ✅  
- **RA:** Only maps to existing releases via `release_external_ids`; does not create games. ✅  
- **DB:** Unique indexes on `games.igdb_game_id`, `releases(platform_key, game_id)`, `release_external_ids(source, external_id)` are defined; apply after repair.
