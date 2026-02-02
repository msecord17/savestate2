-- History of archetype snapshots for diffing (latest vs previous).
-- On recompute: insert latest, then keep last 10 per user.

create table if not exists public.user_archetype_snapshots_history (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  computed_at timestamptz not null default now(),
  payload jsonb not null
);

create index if not exists idx_user_archetype_snapshots_history_user_computed
  on public.user_archetype_snapshots_history (user_id, computed_at desc);

comment on table public.user_archetype_snapshots_history is 'Last 10 archetype snapshots per user for delta (completion, playtime, era, archetype shift).';
comment on column public.user_archetype_snapshots_history.payload is 'Same shape as user_archetype_snapshots.payload: version, computed_at, stats, archetypes.';

alter table public.user_archetype_snapshots_history enable row level security;

create policy "Users can read own snapshot history"
  on public.user_archetype_snapshots_history for select
  using (auth.uid() = user_id);

create policy "Users can insert own snapshot history"
  on public.user_archetype_snapshots_history for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own snapshot history"
  on public.user_archetype_snapshots_history for delete
  using (auth.uid() = user_id);
