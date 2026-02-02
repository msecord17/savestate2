-- One mapping per (source, external_id): platform external id → release_id.
-- Run this AFTER bulk repair so no duplicate (source, external_id) rows exist.

create unique index if not exists release_external_ids_source_external_id_unique
on public.release_external_ids (source, external_id);
