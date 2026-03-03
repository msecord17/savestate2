-- 2026-02-17_hardware_seed_and_aliases.sql

-- 1) Ensure hardware.slug is usable as the canonical key
update public.hardware
set slug = lower(regexp_replace(coalesce(display_name, model, manufacturer, ''), '[^a-z0-9]+', '_', 'g'))
where (slug is null or btrim(slug) = '')
  and coalesce(display_name, model, manufacturer) is not null;

create unique index if not exists hardware_slug_uniq
  on public.hardware (slug);

-- 2) Hardware aliases table (for search + normalization)
create table if not exists public.hardware_aliases (
  id uuid primary key default gen_random_uuid(),
  hardware_id uuid not null references public.hardware(id) on delete cascade,
  alias text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists hardware_aliases_hardware_alias_uniq
  on public.hardware_aliases (hardware_id, alias);

-- 3) Seed: small set (Atari onward) + a few modern retro handhelds as Gen 9
insert into public.hardware
  (slug, kind, manufacturer, model, display_name, release_year, era_key, is_modern_retro_handheld)
values
  -- Atari onward (starter set)
  ('atari_2600', 'console', 'Atari', null, 'Atari 2600', 1977, 'gen1_1972_1977', false),
  ('atari_5200', 'console', 'Atari', null, 'Atari 5200', 1982, 'gen2_1978_1982', false),
  ('atari_7800', 'console', 'Atari', null, 'Atari 7800', 1986, 'gen3_1983_1989', false),

  ('nes', 'console', 'Nintendo', 'NES', 'Nintendo Entertainment System (NES)', 1985, 'gen3_1983_1989', false),
  ('snes', 'console', 'Nintendo', 'SNES', 'Super Nintendo Entertainment System (SNES)', 1991, 'gen4_1990_1995', false),
  ('sega_genesis', 'console', 'Sega', 'Genesis', 'Sega Genesis / Mega Drive', 1988, 'gen4_1990_1995', false),

  ('ps1', 'console', 'Sony', 'PS1', 'PlayStation (PS1)', 1994, 'gen5_1996_1999', false),
  ('n64', 'console', 'Nintendo', 'N64', 'Nintendo 64', 1996, 'gen5_1996_1999', false),

  -- Modern baseline
  ('ps5', 'console', 'Sony', 'PS5', 'PlayStation 5', 2020, 'gen9_2020_plus', false),

  -- Modern retro handhelds (treat as Gen 9)
  ('ayn_odin_2', 'handheld', 'AYN', 'Odin 2', 'AYN Odin 2', 2023, 'gen9_2020_plus', true),
  ('ayaneo_pocket_air', 'handheld', 'AYANEO', 'Pocket Air', 'AYANEO Pocket Air', 2023, 'gen9_2020_plus', true),
  ('retroid_pocket_4_pro', 'handheld', 'Retroid', 'Pocket 4 Pro', 'Retroid Pocket 4 Pro', 2024, 'gen9_2020_plus', true)
on conflict (slug) do update set
  kind = excluded.kind,
  manufacturer = excluded.manufacturer,
  model = excluded.model,
  display_name = excluded.display_name,
  release_year = excluded.release_year,
  era_key = excluded.era_key,
  is_modern_retro_handheld = excluded.is_modern_retro_handheld,
  updated_at = now();

-- 4) Seed aliases safely (join by slug -> hardware_id)
with a(slug, alias) as (
  values
    ('nes','NES'),
    ('nes','Nintendo Entertainment System'),
    ('snes','SNES'),
    ('snes','Super Famicom'),
    ('sega_genesis','Mega Drive'),
    ('ps1','PS1'),
    ('n64','Nintendo64'),
    ('ayn_odin_2','Odin 2'),
    ('retroid_pocket_4_pro','RP4 Pro')
)
insert into public.hardware_aliases (hardware_id, alias)
select h.id, a.alias
from a
join public.hardware h on h.slug = a.slug
on conflict (hardware_id, alias) do nothing;
