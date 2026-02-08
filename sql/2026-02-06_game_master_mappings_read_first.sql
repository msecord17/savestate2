-- Step 1 — Game Master Mapping table: schema for read-first, write-later.
-- Every sync checks this table before calling IGDB.
-- Adds columns to match: source_type, source_title, source_platform, normalized_title, canonical_game_id, status (auto | reviewed | corrected).
-- Handles table created from add_game_master_mappings.sql (platform_key) or from game_external_refs_master_mappings_queue.sql (source).

-- Ensure source exists (older migration used platform_key)
alter table public.game_master_mappings add column if not exists source text;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'game_master_mappings' and column_name = 'platform_key'
  ) then
    update public.game_master_mappings set source = platform_key where source is null and platform_key is not null;
  end if;
end $$;

alter table public.game_master_mappings add column if not exists source_type text;
alter table public.game_master_mappings add column if not exists source_title text;
alter table public.game_master_mappings add column if not exists source_platform text;
alter table public.game_master_mappings add column if not exists normalized_title text;
alter table public.game_master_mappings add column if not exists canonical_game_id uuid references public.games(id) on delete set null;

update public.game_master_mappings set source_type = source where source_type is null and source is not null;

create index if not exists game_master_mappings_canonical_game_id_idx
  on public.game_master_mappings (canonical_game_id) where canonical_game_id is not null;

comment on column public.game_master_mappings.source_type is 'psn | xbox | steam | ra | manual';
comment on column public.game_master_mappings.source_title is 'Raw incoming title from platform';
comment on column public.game_master_mappings.source_platform is 'ps5, xbox360, steam, etc.';
comment on column public.game_master_mappings.normalized_title is 'Cleaned title for search/dedup';
comment on column public.game_master_mappings.canonical_game_id is 'FK to games.id; use this first when present.';
