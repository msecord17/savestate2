-- Add columns to profiles for public profile by username (/u/[username]).
-- Only rows with profile_public = true and non-null username are exposed.
--
-- USERNAME SOURCE OF TRUTH: profiles.username is the single source for /u/[username].
-- It is user-chosen only. Do not derive it from Discord (Discord usernames can change).

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'username') then
    alter table public.profiles add column username text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'display_name') then
    alter table public.profiles add column display_name text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url') then
    alter table public.profiles add column avatar_url text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'discord_handle') then
    alter table public.profiles add column discord_handle text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'profile_public') then
    alter table public.profiles add column profile_public boolean not null default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'public_discord') then
    alter table public.profiles add column public_discord boolean not null default false;
  end if;
end $$;

-- Unique username for lookup (only non-null usernames)
create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username))
  where username is not null and username <> '';

comment on column public.profiles.username is 'Public handle for /u/[username]; user-set only, never derived from Discord. Unique (case-insensitive). Must be set with profile_public = true to appear.';
comment on column public.profiles.profile_public is 'When true, profile is visible at /u/username.';
comment on column public.profiles.public_discord is 'When true, discord_handle is included in public profile.';
