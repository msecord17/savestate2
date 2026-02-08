-- Step 1 — Spine fix: 3 tables for override, observability, and review queue.
-- Lets you: override known-bad matches (hard truth), log every IGDB match attempt (debug patterns),
-- queue low-confidence matches for review (no auto-poison).

-- 1) Manual overrides: the "truth table"
create table if not exists public.igdb_match_overrides (
  id uuid primary key default gen_random_uuid(),
  platform_key text not null,
  external_id text not null,
  igdb_game_id bigint not null,
  note text,
  created_at timestamptz not null default now(),
  created_by text
);

create unique index if not exists igdb_match_overrides_unique
  on public.igdb_match_overrides (platform_key, external_id);


-- 2) Match attempts: observability/debug
create table if not exists public.igdb_match_attempts (
  id uuid primary key default gen_random_uuid(),
  platform_key text not null,
  external_id text,
  release_id uuid,
  raw_title text not null,
  cleaned_title text not null,
  candidates jsonb,
  chosen_igdb_game_id bigint,
  confidence numeric,
  result text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists igdb_match_attempts_release_id_idx on public.igdb_match_attempts (release_id);
create index if not exists igdb_match_attempts_platform_ext_idx on public.igdb_match_attempts (platform_key, external_id);


-- 3) Review queue: human-in-loop without blocking sync
create table if not exists public.igdb_match_review_queue (
  id uuid primary key default gen_random_uuid(),
  platform_key text not null,
  external_id text,
  release_id uuid,
  raw_title text not null,
  cleaned_title text not null,
  suggested_igdb_game_id bigint,
  confidence numeric,
  reason text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists igdb_match_review_queue_status_idx
  on public.igdb_match_review_queue (status, created_at desc);

comment on table public.igdb_match_overrides is 'Manual overrides: platform+external_id → igdb_game_id (hard truth).';
comment on table public.igdb_match_attempts is 'Log every IGDB match attempt for observability/debug. result: matched|low_confidence|miss|override_used.';
comment on table public.igdb_match_review_queue is 'Queue low-confidence matches for human review. status: pending|approved|rejected|fixed.';
