alter table public.sync_runs
add column if not exists result_json jsonb;

create index if not exists sync_runs_user_platform_latest
  on public.sync_runs(user_id, platform, started_at desc);
