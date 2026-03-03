-- Tables for /api/releases/[id] extensions: timeline, cultural, release_versions, related_games
-- Run this migration to enable the new API fields.

-- game_editorial: editorial content per game (era, metacritic, legacy, etc.)
create table if not exists public.game_editorial (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  -- timeline
  era_label text,
  era_blurb text,
  released_text text,
  released_blurb text,
  same_year_text text,
  -- cultural
  metacritic_score numeric,
  metacritic_platform text,
  critic_blurb text,
  community_tags text[],
  community_blurb text,
  legacy_impact text,
  cultural_footnote text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(game_id)
);

create index if not exists idx_game_editorial_game_id on public.game_editorial(game_id);

-- release_notes: per-release badge and blurb (for release_versions)
create table if not exists public.release_notes (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.releases(id) on delete cascade,
  badge text,
  blurb text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(release_id)
);

create index if not exists idx_release_notes_release_id on public.release_notes(release_id);

-- game_relations: curated related games (for related_games)
create table if not exists public.game_relations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  related_game_id uuid not null references public.games(id) on delete cascade,
  reason_label text,
  created_at timestamptz default now(),
  unique(game_id, related_game_id)
);

create index if not exists idx_game_relations_game_id on public.game_relations(game_id);

-- Optional: portfolio_entries.rating and portfolio_entries.identity_tier for community metrics
-- Uncomment if you want avg_member_rating and most_common_identity from portfolio_entries:
-- alter table public.portfolio_entries add column if not exists rating numeric;
-- alter table public.portfolio_entries add column if not exists identity_tier text;
