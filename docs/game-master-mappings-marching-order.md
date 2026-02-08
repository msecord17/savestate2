# Game master mappings — concrete marching order

**Goal:** Make timeline, standout titles, and archetypes stop feeling “random” by treating `game_master_mappings` as the single source of truth: (source, external_id) → canonical game. Sync routes only use confirmed mappings or queue for matching; no ad‑hoc IGDB guesses that create games.

---

## 1. Schema: `game_master_mappings` + unique (source, external_id)

Ensure this table and index exist (run this SQL if not already applied):

```sql
create table if not exists game_master_mappings (
  id uuid primary key default gen_random_uuid(),

  -- Platform identity
  source text not null,                 -- 'psn' | 'xbox' | 'steam' | 'ra'
  external_id text not null,            -- npCommunicationId | title_id | appid | ra_game_id

  -- Optional: platform metadata snapshot
  source_title text,
  source_platform text,                 -- 'PS5', 'Xbox', etc if you have it
  source_cover_url text,                -- title icon if provided

  -- Canonical identity
  igdb_game_id bigint,                  -- nullable until matched
  game_id uuid,                         -- nullable until materialized/linked

  -- Matching control
  status text not null default 'candidate', -- 'candidate' | 'confirmed' | 'rejected' | 'blocked'
  confidence numeric not null default 0,    -- 0..1
  method text,                              -- 'exact_id' | 'title_search' | 'manual' | 'import' etc
  debug jsonb not null default '{}'::jsonb,  -- store tried queries, top hits, why we chose it

  -- Audit
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid
);

create unique index if not exists game_master_mappings_source_external_unique
  on game_master_mappings(source, external_id);

create index if not exists game_master_mappings_igdb_id_idx
  on game_master_mappings(igdb_game_id);

create index if not exists game_master_mappings_status_idx
  on game_master_mappings(status);
```

Use a migration or one-off script so the live DB has this schema (and align any existing migrations that use `platform_key` / different column names via the existing read_first/queue migrations).

---

## 2. PSN / Xbox / Steam sync routes — ingest behavior

Update each sync route (e.g. `web/app/api/sync/psn/route.ts`, `sync/xbox/route.ts`, `sync/steam/route.ts`) so that:

- **On ingest (per platform title):**
  - **Upsert** a row in `game_master_mappings` keyed by `(source, external_id)` with the latest:
    - `source_title`
    - `source_platform`
    - `source_cover_url`
    - and bump `last_seen_at` (and set `first_seen_at` only on insert).

- **If a mapping exists with status = `confirmed` and non-null `igdb_game_id`:**
  - Resolve `game_id` via `games.igdb_game_id` (i.e. look up `games.id` where `games.igdb_game_id = mapping.igdb_game_id`) and use that `game_id` for creating/attaching releases. Do **not** call IGDB or create a new game from a guess.

- **If there is no confirmed mapping (no row, or status ≠ confirmed, or igdb_game_id null):**
  - Do **not** create a new `games` row from an IGDB guess.
  - Ensure the mapping row exists (upsert as above) with `status = 'candidate'`, and **queue it for the matcher** (e.g. insert/update a row in `game_match_queue` so the matcher job can process it later).

Result: every platform title gets a mapping row and either a resolved game (when confirmed) or a queued candidate; no one-off IGDB-driven game creation during sync.

---

## 3. Matcher: `/api/admin/match/run` (or existing cron)

Implement or align an admin endpoint (e.g. `POST /api/admin/match/run` or the existing `matcher/run`) that:

- Processes **candidate** mappings (e.g. from `game_match_queue` or `game_master_mappings` where `status = 'candidate'`).
- For each candidate:
  - Calls IGDB search (e.g. by external id or by title), gets top hits.
  - Stores top hits + confidence (and any “why we chose it” info) in `game_master_mappings.debug`.
  - **Auto-confirms** only when:
    - Confidence is above a defined threshold (e.g. 0.92), and
    - Sanity checks pass (e.g. name/year/cover plausibility).
  - If auto-confirmed: set `status = 'confirmed'`, set `igdb_game_id` (and optionally `game_id` from `games`), set `confirmed_at` / `confirmed_by` if applicable.
  - If not auto-confirmed: leave as `candidate` (or `needs_review`) so the admin page can review.

Ensure the job is idempotent (e.g. lock queue rows, update attempts, handle errors without leaving rows stuck).

---

## 4. Admin page: `/admin/mismatches` (review and confirm mappings)

Create an **`/admin/mismatches`** page that:

- Lists mappings that need human review (e.g. `status = 'candidate'` or `needs_review`, or low confidence).
- Shows: `source`, `external_id`, `source_title`, `source_platform`, `source_cover_url`, and the contents of `debug` (top IGDB hits, confidence, method).
- Allows an admin to:
  - **Confirm** a mapping: pick the correct IGDB game (or “none”), set `status = 'confirmed'`, set `igdb_game_id` and optionally `game_id`, set `confirmed_at` / `confirmed_by`.
  - **Reject** a mapping: set `status = 'rejected'` so sync no longer tries to use it.
  - Optionally **block** or re-queue for re-match.

This is the step that makes everything on top (timeline, standout titles, archetypes) stop feeling “random”: all display flows use only confirmed mappings or explicit review, not ad‑hoc guesses.

---

## Checklist (for Cursor / implementer)

- [ ] DB: `game_master_mappings` table + unique index on `(source, external_id)` as above (and any migrations aligned).
- [ ] PSN sync: upsert mapping with source_title/source_platform/source_cover_url; use confirmed mapping for game_id when present; otherwise set candidate + queue.
- [ ] Xbox sync: same behavior.
- [ ] Steam sync: same behavior.
- [ ] Matcher: process candidates, call IGDB, write debug, auto-confirm only above threshold + sanity checks.
- [ ] Admin: `/admin/mismatches` page to review and confirm/reject mappings.
