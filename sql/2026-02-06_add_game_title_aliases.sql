-- Optional lookup-first for IGDB: map raw/canonical title to a search_title used for IGDB query.
-- When useGameTitleAlias is true, igdbSearchBest() looks up here before searching.

create table if not exists public.game_title_aliases (
  id uuid primary key default gen_random_uuid(),
  raw_title text not null,
  canonical_title text,
  search_title text not null,
  created_at timestamptz not null default now()
);

create index if not exists game_title_aliases_raw_title_idx on public.game_title_aliases (raw_title);
create index if not exists game_title_aliases_canonical_title_idx on public.game_title_aliases (canonical_title);

comment on table public.game_title_aliases is 'Optional: map platform/raw title to IGDB search title for lookup-first behavior.';
