-- Store quiz results (game picks + intensity) in profiles for v1.
-- Later: migrate to quiz_results table if needed.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'quiz_results') then
    alter table public.profiles add column quiz_results jsonb;
  end if;
end $$;

comment on column public.profiles.quiz_results is 'v1: quiz selections (games, intensity, core_memories). Replaced by quiz_results table later.';
