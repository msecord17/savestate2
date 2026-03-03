-- 2026-02-17: hardware catalog, default RA device, played-on per release
--
-- 1) hardware: catalog of consoles/handhelds for dropdowns and RA device selection
-- 2) profiles.default_ra_hardware_id: user's default RetroAchievements device
-- 3) user_release_played_on: which hardware a user played a release on (primary for timeline)

-- 1) hardware table
create table if not exists public.hardware (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  kind text not null,                    -- console, handheld, etc.
  manufacturer text,
  model text,
  display_name text not null,
  release_year int,
  era_key text,
  is_modern_retro_handheld boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_hardware_kind on public.hardware(kind);
create index if not exists idx_hardware_release_year on public.hardware(release_year);
create index if not exists idx_hardware_display_name on public.hardware(display_name);
create index if not exists idx_hardware_manufacturer on public.hardware(manufacturer);
create index if not exists idx_hardware_model on public.hardware(model);

-- hardware is a catalog; read-only for app (admin seeds data)
alter table public.hardware enable row level security;

drop policy if exists "hardware_select_all" on public.hardware;
create policy "hardware_select_all"
  on public.hardware for select
  using (true);

-- 2) profiles.default_ra_hardware_id
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'default_ra_hardware_id') then
    alter table public.profiles add column default_ra_hardware_id uuid references public.hardware(id) on delete set null;
  end if;
end $$;

comment on column public.profiles.default_ra_hardware_id is 'Default RetroAchievements device for played-on inference when RA is the source.';

-- 3) user_release_played_on
create table if not exists public.user_release_played_on (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  release_id uuid not null references public.releases(id) on delete cascade,
  hardware_id uuid not null references public.hardware(id) on delete cascade,
  source text not null default 'manual',   -- manual | ra_default | ra_manual_override | system_detected
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, release_id, hardware_id)
);

create index if not exists idx_user_release_played_on_user_release
  on public.user_release_played_on(user_id, release_id);

alter table public.user_release_played_on enable row level security;

drop policy if exists "played_on_select_own" on public.user_release_played_on;
drop policy if exists "played_on_insert_own" on public.user_release_played_on;
drop policy if exists "played_on_update_own" on public.user_release_played_on;
drop policy if exists "played_on_delete_own" on public.user_release_played_on;

create policy "played_on_select_own"
  on public.user_release_played_on for select
  using (auth.uid() = user_id);

create policy "played_on_insert_own"
  on public.user_release_played_on for insert
  with check (auth.uid() = user_id);

create policy "played_on_update_own"
  on public.user_release_played_on for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "played_on_delete_own"
  on public.user_release_played_on for delete
  using (auth.uid() = user_id);

-- 4) source check constraint (manual | ra_default | ra_manual_override | system_detected)
alter table public.user_release_played_on
  drop constraint if exists user_release_played_on_source_check;
alter table public.user_release_played_on
  add constraint user_release_played_on_source_check
  check (source in ('manual', 'ra_default', 'ra_manual_override', 'system_detected'));

-- 5) unique index: one row per (user, release, hardware, source)
-- drop old (user, release, hardware) unique if present; new allows same hardware with different source
alter table public.user_release_played_on
  drop constraint if exists user_release_played_on_user_id_release_id_hardware_id_key;
create unique index if not exists user_release_played_on_uq
  on public.user_release_played_on (user_id, release_id, hardware_id, source);

-- 6) partial unique: only one primary per (user, release)
create unique index if not exists user_release_played_on_primary_uq
  on public.user_release_played_on (user_id, release_id)
  where is_primary = true;

-- 7) RPC: insert primary played-on only if none exists (RA auto-default)
create or replace function public.ensure_played_on_primary(
  p_user_id uuid,
  p_release_id uuid,
  p_hardware_id uuid,
  p_source text default 'ra_default'
) returns void
language plpgsql
as $$
begin
  insert into public.user_release_played_on (
    user_id, release_id, hardware_id, source, is_primary
  )
  values (
    p_user_id, p_release_id, p_hardware_id, coalesce(nullif(trim(p_source), ''), 'ra_default'), true
  )
  on conflict (user_id, release_id) where is_primary = true
  do nothing;
end;
$$;
