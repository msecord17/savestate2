-- Optional: used by enrichment to skip non-games (app, tool). Populate from Steam store or IGDB category.

alter table public.games
  add column if not exists content_type text;

comment on column public.games.content_type is 'e.g. game, app, tool; enrichment skips IGDB when in (app, tool).';
