-- Optional: IGDB category (0 = main_game). Used to filter non-games from timeline/standouts.

alter table public.games
  add column if not exists igdb_category smallint;

comment on column public.games.igdb_category is 'IGDB category: 0 = main_game. Filter timeline/standouts to main_game when set.';
