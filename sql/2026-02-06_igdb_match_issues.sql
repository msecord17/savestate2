-- Log low-confidence matches and suspected non-game rows for review.

create table if not exists public.igdb_match_issues (
  id uuid primary key default gen_random_uuid(),
  source text,
  external_id text,
  game_id uuid references public.games(id) on delete set null,
  igdb_game_id bigint,
  confidence numeric(5,4),
  issue_type text not null,  -- 'low_confidence' | 'non_game_suspected'
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists igdb_match_issues_created_at_idx
  on public.igdb_match_issues(created_at desc);
create index if not exists igdb_match_issues_issue_type_idx
  on public.igdb_match_issues(issue_type);
create index if not exists igdb_match_issues_game_id_idx
  on public.igdb_match_issues(game_id) where game_id is not null;

comment on table public.igdb_match_issues is 'Auto-logged: confidence < 0.80 or suspected non-game (igdb_category/DLC). For admin review.';
