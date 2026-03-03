-- 2026-02-18: user_memory_titles — "I remember this" memory recall loop
-- Stores a tiny row per (user, release) when user marks a title as remembered.
-- Optional tags later: owned | rented | played-at-friend

create table if not exists public.user_memory_titles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete cascade,
  platform_key text null,
  remembered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, release_id)
);

create index if not exists idx_user_memory_titles_user_id
  on public.user_memory_titles(user_id);

create index if not exists idx_user_memory_titles_release_id
  on public.user_memory_titles(release_id);

create index if not exists idx_user_memory_titles_remembered_at
  on public.user_memory_titles(remembered_at desc);

alter table public.user_memory_titles enable row level security;

drop policy if exists "memory_select_own" on public.user_memory_titles;
drop policy if exists "memory_insert_own" on public.user_memory_titles;
drop policy if exists "memory_delete_own" on public.user_memory_titles;

create policy "memory_select_own"
  on public.user_memory_titles for select
  using (auth.uid() = user_id);

create policy "memory_insert_own"
  on public.user_memory_titles for insert
  with check (auth.uid() = user_id);

create policy "memory_delete_own"
  on public.user_memory_titles for delete
  using (auth.uid() = user_id);

comment on table public.user_memory_titles is 'User marks titles they remember (memory recall loop). Optional tags later: owned, rented, played-at-friend.';
