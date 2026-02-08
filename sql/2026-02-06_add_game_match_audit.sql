-- Audit log for match decisions (pending/accepted/rejected). Use this if you prefer
-- game_match_audit over game_match_attempts for per-release/match audit.

create table if not exists public.game_match_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  user_id uuid null,
  platform_key text null,
  release_id uuid null,
  game_id uuid null references public.games(id) on delete set null,

  raw_title text not null,
  cleaned_title text not null,

  igdb_game_id_candidate bigint null,
  igdb_title_candidate text null,
  confidence numeric null,
  decision text not null default 'pending',
  reason text null,

  candidates jsonb null
);

-- Ensure columns exist (in case table was created earlier with fewer columns)
alter table public.game_match_audit add column if not exists game_id uuid null references public.games(id) on delete set null;
alter table public.game_match_audit add column if not exists decision text null default 'pending';

create index if not exists game_match_audit_game_idx on public.game_match_audit (game_id);
create index if not exists game_match_audit_release_idx on public.game_match_audit (release_id);
create index if not exists game_match_audit_pending_idx on public.game_match_audit (decision) where decision = 'pending';

comment on table public.game_match_audit is 'Audit of match decisions: accepted/rejected/pending with raw/cleaned title and candidates.';
