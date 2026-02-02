-- Tracks releases that thin sync (e.g. Steam) has touched so enrichment can pick them up.
-- One row per release; enrichment reads from this (e.g. join releases where games.igdb_game_id is null).

create table if not exists public.release_enrichment_state (
  release_id uuid not null references public.releases(id) on delete cascade,
  source text not null default 'steam',
  updated_at timestamptz not null default now(),
  primary key (release_id)
);

create index if not exists release_enrichment_state_source_updated_at_idx
  on public.release_enrichment_state (source, updated_at);

comment on table public.release_enrichment_state is 'Releases touched by thin sync; enrichment batch job uses this to find candidates (e.g. where games.igdb_game_id is null).';
