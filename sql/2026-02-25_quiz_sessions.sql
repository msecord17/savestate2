-- Quiz sessions: stores quiz results for both logged-in and anonymous users.
-- user_id null = anonymous; set on claim when user signs up.

create table if not exists public.quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists quiz_sessions_user_id_idx on public.quiz_sessions(user_id);
create index if not exists quiz_sessions_created_at_idx on public.quiz_sessions(created_at desc);

comment on table public.quiz_sessions is 'Quiz results (game picks, intensity). user_id null = anonymous; claim on signup.';
