-- Master mapping: (platform_key, external_id) → chosen IGDB match. Sync looks up before calling IGDB.
-- If mapping exists with igdb_game_id, use it to resolve game. If confirmed, never auto-change.

create table if not exists public.game_master_mappings (
  id uuid primary key default gen_random_uuid(),
  platform_key text not null,
  external_id text not null,
  igdb_game_id bigint null,
  confidence numeric(5,4) null,
  chosen_igdb_name text null,
  chosen_igdb_year int null,
  status text not null default 'proposed',
  method text not null default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform_key, external_id)
);

create index if not exists game_master_mappings_platform_external_idx
  on public.game_master_mappings (platform_key, external_id);
create index if not exists game_master_mappings_igdb_idx
  on public.game_master_mappings (igdb_game_id) where igdb_game_id is not null;
create index if not exists game_master_mappings_status_idx
  on public.game_master_mappings (status);

comment on table public.game_master_mappings is 'Platform external id → chosen IGDB game. Sync uses this before IGDB; only write games.igdb_game_id when confidence >= 0.92. confirmed = never auto-change.';
comment on column public.game_master_mappings.status is 'proposed | confirmed';
comment on column public.game_master_mappings.method is 'auto | manual';
