-- Step 1 — Add tables: game_external_refs (every platform title, normalized), game_master_mappings (canonical decision), game_match_queue (worklist).
-- Key: unique external key per source + persistent mapping + queue.

-- A) game_external_refs — every platform title, normalized
create table if not exists public.game_external_refs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  platform_key text,
  raw_title text not null,
  normalized_title text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(source, external_id)
);

create index if not exists game_external_refs_source_ext_idx
  on public.game_external_refs (source, external_id);
create index if not exists game_external_refs_platform_idx
  on public.game_external_refs (platform_key) where platform_key is not null;

comment on table public.game_external_refs is 'Every platform title seen; source (psn|xbox|steam|ra|…), external_id, raw/normalized title.';


-- B) game_master_mappings — the canonical decision (source + external_id → igdb_game_id + status)
create table if not exists public.game_master_mappings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  igdb_game_id bigint null,
  status text not null default 'needs_review',
  confidence numeric null,
  method text null,
  matched_name text null,
  matched_year int null,
  meta jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source, external_id)
);

create index if not exists game_master_mappings_source_ext_idx
  on public.game_master_mappings (source, external_id);
create index if not exists game_master_mappings_igdb_idx
  on public.game_master_mappings (igdb_game_id) where igdb_game_id is not null;
create index if not exists game_master_mappings_status_idx
  on public.game_master_mappings (status);

comment on table public.game_master_mappings is 'Canonical decision: source + external_id → igdb_game_id. status: auto_approved|needs_review|manual|rejected. method: exact|alias|fuzzy|manual.';
comment on column public.game_master_mappings.matched_name is 'IGDB name at time of match';
comment on column public.game_master_mappings.meta is 'Debug payload: candidates + scores';


-- C) game_match_queue — worklist for matching
create table if not exists public.game_match_queue (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  priority int not null default 0,
  attempts int not null default 0,
  locked_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source, external_id)
);

create index if not exists game_match_queue_source_ext_idx
  on public.game_match_queue (source, external_id);
create index if not exists game_match_queue_priority_idx
  on public.game_match_queue (priority desc, updated_at) where locked_at is null;

comment on table public.game_match_queue is 'Worklist: (source, external_id) to be matched; priority, attempts, locked_at for workers.';


-- If game_master_mappings already exists (e.g. from 2026-02-06_add_game_master_mappings) with platform_key instead of source, add new columns and backfill.
alter table public.game_master_mappings add column if not exists source text;
alter table public.game_master_mappings add column if not exists meta jsonb;
alter table public.game_master_mappings add column if not exists matched_name text;
alter table public.game_master_mappings add column if not exists matched_year int;
update public.game_master_mappings set source = platform_key where source is null and platform_key is not null;
comment on column public.game_master_mappings.meta is 'Debug payload: candidates + scores';
comment on column public.game_master_mappings.matched_name is 'IGDB name at time of match';
