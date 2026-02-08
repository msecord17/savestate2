-- Manual override: (source, external_id) -> igdb_game_id. Checked before any IGDB matching.
-- When present, sync uses this igdb_game_id to resolve game (no search, no validation).

create table if not exists public.manual_igdb_overrides (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  igdb_game_id bigint not null,
  created_at timestamptz not null default now(),
  unique(source, external_id)
);

create index if not exists manual_igdb_overrides_source_external_id_idx
  on public.manual_igdb_overrides (source, external_id);

comment on table public.manual_igdb_overrides is 'Manual mapping: platform (source, external_id) -> igdb_game_id. Checked before IGDB search; when set, game is resolved by this IGDB id only.';
