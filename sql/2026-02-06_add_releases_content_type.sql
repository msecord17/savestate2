-- releases.content_type: used by get_origin_timeline to exclude non-games (e.g. Xbox apps) from identity.
alter table public.releases
  add column if not exists content_type text;

comment on column public.releases.content_type is 'e.g. game, app. Identity/timeline exclude when not null and != game.';
