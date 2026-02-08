-- Canonical identity: platform external id → games.id (one row per source+external_id).
-- Sync resolves game_id via game_external_ids first, then IGDB/title-only, then writes here.
-- Keeps release_external_ids for idempotency (platform id → release row).

create table if not exists public.game_external_ids (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  game_id uuid not null references public.games(id) on delete cascade,
  confidence numeric(3,2),
  match_source text,
  matched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(source, external_id)
);

create index if not exists game_external_ids_game_id_idx on public.game_external_ids (game_id);
create index if not exists game_external_ids_source_external_id_idx on public.game_external_ids (source, external_id);

comment on table public.game_external_ids is 'Canonical mapping: platform external id → games.id. Sync resolves game first via this table, then creates/finds release by (platform_key, game_id).';
