-- Add a DB-level constraint for IGDB-first identity.
-- This is a partial unique index: allows multiple NULLs, but enforces uniqueness for real IGDB ids.
--
-- Run this AFTER you dedupe any existing duplicates of games.igdb_game_id.

create unique index if not exists games_igdb_game_id_unique_not_null
on public.games (igdb_game_id)
where igdb_game_id is not null;

