-- 2026-02-17: hardware_search_logs table + admin_hardware_misses RPC
-- For admin UI: top search queries that returned 0 results

-- Ensure hardware_search_logs exists (if not already created elsewhere)
create table if not exists public.hardware_search_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  query text not null,
  results_count int not null default 0,
  used_fallback boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_hardware_search_logs_created_at
  on public.hardware_search_logs(created_at);
create index if not exists idx_hardware_search_logs_results_count
  on public.hardware_search_logs(results_count);

-- RPC: aggregated top misses for admin UI
create or replace function public.admin_hardware_misses(
  p_days int default 14,
  p_limit int default 50
) returns table (query text, misses bigint, last_seen timestamptz)
language sql
stable
security definer
as $$
  select l.query::text, count(*)::bigint as misses, max(l.created_at) as last_seen
  from public.hardware_search_logs l
  where l.results_count = 0
    and l.created_at > now() - (p_days || ' days')::interval
  group by l.query
  order by misses desc
  limit p_limit;
$$;
