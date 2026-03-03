-- Atomic upsert for release_external_ids that always returns release_id (even on conflict).
-- Fixes "release race lookup failed" when insert hits 23505 and follow-up SELECT returns nothing.
-- Handles:
--   - ON CONFLICT (source, external_id): no-op update, return release_id
--   - 23505 on (release_id, source): release already has a row for this source; return p_release_id

create or replace function public.ensure_release_external_id(
  p_source text,
  p_external_id text,
  p_release_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release_id uuid;
begin
  insert into public.release_external_ids (source, external_id, release_id)
  values (p_source, p_external_id, p_release_id)
  on conflict (source, external_id)
  do update set release_id = public.release_external_ids.release_id
  returning release_id into v_release_id;
  return v_release_id;
exception
  when unique_violation then
    -- (release_id, source) already exists: this release is already mapped for this source
    return p_release_id;
end;
$$;
