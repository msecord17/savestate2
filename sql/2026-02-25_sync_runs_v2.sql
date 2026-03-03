-- sync_runs v2: schema with created_at, ok, summary, error
-- Drops existing table if present (from 2026-02-25_sync_runs.sql) so this schema applies.

drop table if exists public.sync_runs cascade;

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  ok boolean not null,
  summary jsonb null,
  error text null
);

create index idx_sync_runs_user_platform_time
  on public.sync_runs(user_id, platform, created_at desc);

alter table public.sync_runs enable row level security;

drop policy if exists "sync_runs_select_own" on public.sync_runs;
create policy "sync_runs_select_own"
  on public.sync_runs for select
  using (auth.uid() = user_id);

comment on table public.sync_runs is 'Per-platform sync run results. No direct insert from client; inserts happen via server routes with service role.';
