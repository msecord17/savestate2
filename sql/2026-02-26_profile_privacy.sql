-- Add profile_visibility and profile_sharing for granular privacy control.
-- profile_visibility: public | unlisted | private (who can see the profile)
-- profile_sharing: JSONB per-section toggles (show_score, show_timeline, etc.)

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'profile_visibility') then
    alter table public.profiles add column profile_visibility text default 'public'
      check (profile_visibility in ('public', 'unlisted', 'private'));
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'profile_sharing') then
    alter table public.profiles add column profile_sharing jsonb default '{}';
  end if;
end $$;

comment on column public.profiles.profile_visibility is 'public: discoverable; unlisted: only with link; private: 404 for non-owner.';
comment on column public.profiles.profile_sharing is 'Per-section toggles: show_score, show_timeline, show_recent_activity, show_played_on, show_platforms, show_collections, show_archetypes.';
