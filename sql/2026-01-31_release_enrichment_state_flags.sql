-- Enrichment tracking: has_igdb/has_cover = already enriched; attempt_count/last_error for failures.

alter table public.release_enrichment_state
  add column if not exists has_igdb boolean default false,
  add column if not exists has_cover boolean default false,
  add column if not exists attempt_count int not null default 0,
  add column if not exists last_error text,
  add column if not exists last_attempt_at timestamptz;

comment on column public.release_enrichment_state.has_igdb is 'Game has igdb_game_id set (enrichment found IGDB match).';
comment on column public.release_enrichment_state.has_cover is 'Release or game has cover_url set.';
comment on column public.release_enrichment_state.attempt_count is 'Number of enrichment attempts (incremented on failure).';
comment on column public.release_enrichment_state.last_error is 'Last error message from enrichment attempt.';
comment on column public.release_enrichment_state.last_attempt_at is 'Timestamp of last enrichment attempt.';
