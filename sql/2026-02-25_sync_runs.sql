-- sync_runs: track per-platform sync results for /api/users/me/connections
-- status: syncing (in progress), ok, error

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  status text not null check (status in ('syncing', 'ok', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  error_message text
);

create index if not exists sync_runs_user_platform_latest
  on public.sync_runs(user_id, platform, started_at desc);

comment on table public.sync_runs is 'Per-platform sync run results for Connect page status/duration/error display.';
