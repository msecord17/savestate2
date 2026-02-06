-- Table and unique constraint for identity share links (POST /api/identity/share).
-- One row per user; share_id is stable until you explicitly rotate.

create table if not exists public.user_identity_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  share_id text not null,
  snapshot jsonb,
  updated_at timestamptz not null default now()
);

-- Optional: add snapshot column if table already existed without it
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_identity_shares' and column_name = 'snapshot'
  ) then
    alter table public.user_identity_shares add column snapshot jsonb;
  end if;
end $$;

create unique index if not exists user_identity_shares_user_unique
  on public.user_identity_shares (user_id);

comment on table public.user_identity_shares is 'One share link per user for public identity page; share_id is stable across refresh.';
