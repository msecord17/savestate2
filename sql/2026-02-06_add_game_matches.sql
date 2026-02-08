-- Match registry: proposed IGDB matches per game (and optional release). Only one accepted match per game.
-- Review UI lists proposed; accept writes games.igdb_game_id + cover; reject leaves game unchanged.

create table if not exists public.game_matches (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  release_id uuid references public.releases(id) on delete set null,
  source text not null,
  source_title text not null,
  source_external_id text,
  igdb_game_id bigint not null,
  status text not null default 'proposed',
  confidence numeric(5,4),
  match_debug jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists game_matches_source_source_title_idx
  on public.game_matches (source, source_title);
create index if not exists game_matches_igdb_game_id_idx
  on public.game_matches (igdb_game_id);
create index if not exists game_matches_game_id_status_idx
  on public.game_matches (game_id, status);
create index if not exists game_matches_status_confidence_idx
  on public.game_matches (status, confidence desc nulls last);

-- Only one accepted match per game.
create unique index if not exists game_matches_one_accepted_per_game_idx
  on public.game_matches (game_id) where (status = 'accepted');

-- Only one accepted match per (release, source) when release is set.
create unique index if not exists game_matches_one_accepted_per_release_source_idx
  on public.game_matches (release_id, source) where (status = 'accepted' and release_id is not null);

comment on table public.game_matches is 'Registry of proposed/accepted/rejected IGDB matches. games.igdb_game_id set only when a match is accepted.';
comment on column public.game_matches.status is 'proposed | accepted | rejected';
comment on column public.game_matches.resolved_by is 'auto | manual (e.g. admin user id)';
