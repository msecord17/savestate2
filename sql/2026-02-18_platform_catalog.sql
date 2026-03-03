-- 2026-02-18: platform_catalog — human-friendly platform keys, display names, aliases
-- Maps messy keys/slugs to canonical platform_key. Redirect /platforms/nintendo-64 → n64

create table if not exists public.platform_catalog (
  platform_key text primary key,
  display_name text not null,
  sort_order int not null default 0,
  era_key text null,
  manufacturer text null,
  aliases text[] not null default '{}'
);

create index if not exists idx_platform_catalog_sort
  on public.platform_catalog(sort_order);

create index if not exists idx_platform_catalog_aliases
  on public.platform_catalog using gin(aliases);

alter table public.platform_catalog enable row level security;

drop policy if exists "platform_catalog_select_all" on public.platform_catalog;
create policy "platform_catalog_select_all"
  on public.platform_catalog for select
  using (true);

-- Seed: common platforms with human-friendly display names and aliases
insert into public.platform_catalog (platform_key, display_name, sort_order, era_key, manufacturer, aliases)
values
  ('n64', 'Nintendo 64', 60, 'gen5_1996_1999', 'Nintendo', array['nintendo 64', 'nintendo-64', 'nintendo64', 'n64']),
  ('snes', 'Super Nintendo', 50, 'gen4_1990_1995', 'Nintendo', array['super nintendo', 'super nintendo entertainment system', 'snes', 'super famicom', 'sfc']),
  ('nes', 'Nintendo Entertainment System', 40, 'gen3_1983_1989', 'Nintendo', array['nintendo entertainment system', 'nes', 'famicom']),
  ('gamecube', 'Nintendo GameCube', 80, 'gen6_2000_2005', 'Nintendo', array['gamecube', 'game cube', 'ngc', 'gc']),
  ('gba', 'Game Boy Advance', 75, 'gen6_2000_2005', 'Nintendo', array['game boy advance', 'gba']),
  ('gb', 'Game Boy', 45, 'gen4_1990_1995', 'Nintendo', array['game boy', 'gb']),
  ('gbc', 'Game Boy Color', 55, 'gen5_1996_1999', 'Nintendo', array['game boy color', 'gbc']),
  ('genesis', 'Sega Genesis', 48, 'gen4_1990_1995', 'Sega', array['sega genesis', 'genesis', 'mega drive', 'md']),
  ('ps1', 'PlayStation', 58, 'gen5_1996_1999', 'Sony', array['playstation', 'playstation 1', 'ps1', 'psx']),
  ('ps2', 'PlayStation 2', 70, 'gen6_2000_2005', 'Sony', array['playstation 2', 'ps2']),
  ('ps3', 'PlayStation 3', 85, 'gen7_2006_2012', 'Sony', array['playstation 3', 'ps3']),
  ('ps4', 'PlayStation 4', 95, 'gen8_2013_2019', 'Sony', array['playstation 4', 'ps4']),
  ('ps5', 'PlayStation 5', 105, 'gen9_2020_plus', 'Sony', array['playstation 5', 'ps5']),
  ('steam', 'Steam', 100, 'gen9_2020_plus', 'Valve', array['steam', 'pc']),
  ('xbox', 'Xbox', 72, 'gen6_2000_2005', 'Microsoft', array['xbox', 'xbox og', 'xbox original']),
  ('xbox360', 'Xbox 360', 82, 'gen7_2006_2012', 'Microsoft', array['xbox 360', 'xbox360', 'x360']),
  ('xbox_one', 'Xbox One', 92, 'gen8_2013_2019', 'Microsoft', array['xbox one', 'xboxone']),
  ('psn', 'PlayStation Network', 98, 'gen9_2020_plus', 'Sony', array['playstation network', 'psn', 'playstation store']),
  ('ra', 'RetroAchievements', 90, null, null, array['retroachievements', 'ra']),
  ('atari_2600', 'Atari 2600', 10, 'gen1_1972_1977', 'Atari', array['atari 2600', 'atari2600', 'vcs'])
on conflict (platform_key) do update set
  display_name = excluded.display_name,
  sort_order = excluded.sort_order,
  era_key = excluded.era_key,
  manufacturer = excluded.manufacturer,
  aliases = excluded.aliases;

-- RPC: resolve slug/alias to canonical platform_key
create or replace function public.resolve_platform_slug(p_slug text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text;
  v_key text;
begin
  v_normalized := lower(trim(coalesce(p_slug, '')));
  if v_normalized = '' then
    return null;
  end if;

  -- Replace spaces/hyphens for slug matching
  v_normalized := regexp_replace(v_normalized, '[^a-z0-9]+', '-', 'g');
  v_normalized := regexp_replace(v_normalized, '-+$', '');
  v_normalized := regexp_replace(v_normalized, '^-+', '');

  -- 1) Exact platform_key match
  select platform_key into v_key
  from platform_catalog
  where lower(platform_key) = v_normalized
  limit 1;
  if v_key is not null then
    return v_key;
  end if;

  -- 2) Match aliases: normalize both (strip non-alphanumeric) and compare
  select platform_key into v_key
  from platform_catalog
  where exists (
    select 1 from unnest(aliases) a
    where lower(regexp_replace(a, '[^a-z0-9]', '', 'g')) = regexp_replace(v_normalized, '[^a-z0-9]', '', 'g')
  )
  limit 1;
  if v_key is not null then
    return v_key;
  end if;

  -- 3) Match display_name (prefix or contains)
  select platform_key into v_key
  from platform_catalog
  where lower(display_name) = v_normalized
     or lower(regexp_replace(display_name, '[^a-z0-9]+', '-', 'g')) = v_normalized
  limit 1;
  if v_key is not null then
    return v_key;
  end if;

  return null;
end;
$$;

comment on function public.resolve_platform_slug(text) is 'Resolve human-friendly slug/alias to canonical platform_key. e.g. nintendo-64 -> n64';

-- RPC: search platforms by keyword (matches platform_key, display_name, aliases)
create or replace function public.search_platforms(p_query text)
returns table(platform_key text, display_name text, sort_order int, match_type text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pattern text;
begin
  v_pattern := '%' || lower(trim(coalesce(p_query, ''))) || '%';
  if length(trim(coalesce(p_query, ''))) < 2 then
    return;
  end if;

  return query
  select
    pc.platform_key,
    pc.display_name,
    pc.sort_order,
    case
      when lower(pc.platform_key) like v_pattern then 'key'
      when lower(pc.display_name) like v_pattern then 'name'
      when exists (
        select 1 from unnest(pc.aliases) a
        where lower(a) like v_pattern
      ) then 'alias'
      else 'other'
    end
  from platform_catalog pc
  where lower(pc.platform_key) like v_pattern
     or lower(pc.display_name) like v_pattern
     or exists (
       select 1 from unnest(pc.aliases) a
       where lower(a) like v_pattern
     )
  order by pc.sort_order, pc.display_name
  limit 20;
end;
$$;

comment on function public.search_platforms(text) is 'Search platforms by keyword. Matches platform_key, display_name, and aliases.';
