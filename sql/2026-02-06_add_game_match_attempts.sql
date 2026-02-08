-- Audit + replay: each match attempt (platform item -> IGDB candidate) with confidence and outcome.
-- Only commit games.igdb_game_id/cover_url when confidence passes threshold and validations succeed.

create table if not exists public.game_match_attempts (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  title_used text,
  game_id uuid references public.games(id) on delete set null,
  igdb_game_id_candidate bigint,
  confidence numeric(5,4),
  reasons_json jsonb,
  outcome text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Ensure all columns exist (in case table was created from an older/different schema)
alter table public.game_match_attempts add column if not exists source text;
alter table public.game_match_attempts add column if not exists external_id text;
alter table public.game_match_attempts add column if not exists title_used text;
alter table public.game_match_attempts add column if not exists game_id uuid references public.games(id) on delete set null;
alter table public.game_match_attempts add column if not exists igdb_game_id_candidate bigint;
alter table public.game_match_attempts add column if not exists confidence numeric(5,4);
alter table public.game_match_attempts add column if not exists reasons_json jsonb;
alter table public.game_match_attempts add column if not exists outcome text default 'pending';
alter table public.game_match_attempts add column if not exists created_at timestamptz default now();
alter table public.game_match_attempts add column if not exists resolved_at timestamptz;

create index if not exists game_match_attempts_source_external_id_idx
  on public.game_match_attempts (source, external_id);
create index if not exists game_match_attempts_game_id_idx on public.game_match_attempts (game_id);
create index if not exists game_match_attempts_outcome_idx on public.game_match_attempts (outcome);

comment on table public.game_match_attempts is 'Audit of platform->IGDB match attempts. outcome: skipped, pending, accepted, rejected. reasons_json: token_overlap, bundle_mismatch, category_guardrail, etc.';
comment on column public.game_match_attempts.outcome is 'skipped = non-game never sent to IGDB; pending = not yet committed; accepted = committed to games; rejected = below threshold or validation failed.';
