-- game_master_mappings: columns for ingest (source_title, source_platform, source_cover_url)
-- and for matcher/admin (first_seen_at, last_seen_at, confirmed_at, confirmed_by).
-- Use with existing table from game_external_refs_master_mappings_queue or add_game_master_mappings.

alter table public.game_master_mappings add column if not exists source_title text;
alter table public.game_master_mappings add column if not exists source_platform text;
alter table public.game_master_mappings add column if not exists source_cover_url text;
alter table public.game_master_mappings add column if not exists first_seen_at timestamptz default now();
alter table public.game_master_mappings add column if not exists last_seen_at timestamptz default now();
alter table public.game_master_mappings add column if not exists confirmed_at timestamptz;
alter table public.game_master_mappings add column if not exists confirmed_by uuid;

-- Matcher/admin UI columns (queue migration adds these; add here so they exist if table came from add_game_master_mappings)
alter table public.game_master_mappings add column if not exists matched_name text;
alter table public.game_master_mappings add column if not exists matched_year int;
alter table public.game_master_mappings add column if not exists meta jsonb;
alter table public.game_master_mappings add column if not exists matched_at timestamptz;

-- Backfill from legacy chosen_igdb_name/chosen_igdb_year if present
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_master_mappings' and column_name = 'chosen_igdb_name') then
    update public.game_master_mappings set matched_name = chosen_igdb_name where matched_name is null and chosen_igdb_name is not null;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_master_mappings' and column_name = 'chosen_igdb_year') then
    update public.game_master_mappings set matched_year = chosen_igdb_year where matched_year is null and chosen_igdb_year is not null;
  end if;
end $$;

-- canonical_game_id already added by read_first; ensure we can use it for resolved game_id
-- Status: allow 'candidate' (sync ingest), 'confirmed' (matcher or manual), 'rejected', 'blocked'
-- No schema change needed for status values; app uses them.

comment on column public.game_master_mappings.source_title is 'Latest platform title from sync';
comment on column public.game_master_mappings.source_platform is 'e.g. PS5, Xbox, Steam';
comment on column public.game_master_mappings.source_cover_url is 'Platform icon/cover URL from sync';
