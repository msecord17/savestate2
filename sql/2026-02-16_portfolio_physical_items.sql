-- 2026-02-16_portfolio_physical_items.sql

create table if not exists public.portfolio_physical_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,

  -- What is the thing?
  kind text not null default 'game', -- game | console | handheld | accessory | controller | other

  -- Human-readable title (required)
  title text not null,

  -- Optional light metadata
  platform_key text null,            -- e.g. snes, ps2, gamecube, gba, etc.
  quantity int not null default 1,
  condition text null,               -- e.g. cib, boxed, loose, new, etc. (freeform ok for v1)
  notes text null,

  -- Optional link to a release if you matched it
  release_id uuid null references public.releases(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_portfolio_physical_items_user_id
  on public.portfolio_physical_items(user_id);

create index if not exists idx_portfolio_physical_items_created_at
  on public.portfolio_physical_items(created_at desc);

alter table public.portfolio_physical_items enable row level security;

-- Drop condition check constraint if it exists (allow freeform: cib, boxed, loose, new, good, etc.)
alter table public.portfolio_physical_items drop constraint if exists portfolio_physical_items_condition_check;

-- RLS policies (recreate cleanly)
drop policy if exists "physical_select_own" on public.portfolio_physical_items;
drop policy if exists "physical_insert_own" on public.portfolio_physical_items;
drop policy if exists "physical_update_own" on public.portfolio_physical_items;
drop policy if exists "physical_delete_own" on public.portfolio_physical_items;

create policy "physical_select_own"
on public.portfolio_physical_items
for select
using (auth.uid() = user_id);

create policy "physical_insert_own"
on public.portfolio_physical_items
for insert
with check (auth.uid() = user_id);

create policy "physical_update_own"
on public.portfolio_physical_items
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "physical_delete_own"
on public.portfolio_physical_items
for delete
using (auth.uid() = user_id);
