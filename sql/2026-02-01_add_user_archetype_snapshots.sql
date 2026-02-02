-- Snapshot table for computed archetype payload (GameHome instant load).
-- Recompute on POST /api/insights/recompute or when GET finds snapshot missing/stale (>24h).

create table if not exists public.user_archetype_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  version text not null,
  payload jsonb not null,
  computed_at timestamptz not null default now()
);

comment on table public.user_archetype_snapshots is 'Cached archetype blend + signals per user; recompute after sync or every 24h.';
comment on column public.user_archetype_snapshots.version is 'Logic version (e.g. v0) so schema changes can invalidate.';
comment on column public.user_archetype_snapshots.payload is 'ArchetypesPayload: primary, secondary, strength, signals, evolution.';
comment on column public.user_archetype_snapshots.computed_at is 'When snapshot was computed; stale if < now() - interval ''24 hours''.';

alter table public.user_archetype_snapshots enable row level security;

create policy "Users can read own snapshot"
  on public.user_archetype_snapshots for select
  using (auth.uid() = user_id);

create policy "Users can insert own snapshot"
  on public.user_archetype_snapshots for insert
  with check (auth.uid() = user_id);

create policy "Users can update own snapshot"
  on public.user_archetype_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
