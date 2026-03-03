-- Reject rules: never auto-match (platform_key, external_id) to this igdb_game_id.
-- Used when user marks a match as wrong on the release page.
create table if not exists public.igdb_match_rejects (
  id uuid primary key default gen_random_uuid(),
  platform_key text not null,
  external_id text not null,
  igdb_game_id bigint not null,
  release_id uuid,
  created_at timestamptz not null default now(),
  created_by text
);

create unique index if not exists igdb_match_rejects_unique
  on public.igdb_match_rejects (platform_key, external_id, igdb_game_id);

create index if not exists igdb_match_rejects_lookup_idx
  on public.igdb_match_rejects (platform_key, external_id);

comment on table public.igdb_match_rejects is 'Never auto-match this (platform_key, external_id) to this igdb_game_id.';
