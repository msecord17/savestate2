-- Match audit: deterministic + auditable IGDB matching. Only commit when score >= threshold or after review.

alter table public.games
  add column if not exists match_status text not null default 'unmatched',
  add column if not exists match_confidence numeric(5,4),
  add column if not exists match_method text,
  add column if not exists match_query text,
  add column if not exists match_debug jsonb,
  add column if not exists matched_at timestamptz;

comment on column public.games.match_status is 'provisional | unmatched | needs_review | auto_matched | verified. provisional = created from sync without IGDB; resolver may promote.';
comment on column public.games.match_confidence is '0..1 score from scoreCandidate when matched or needs_review';
comment on column public.games.match_method is 'e.g. igdb_search';
comment on column public.games.match_query is 'Search query sent to IGDB';
comment on column public.games.match_debug is 'Candidates + scores for needs_review; audit trail';
comment on column public.games.matched_at is 'When igdb_game_id was set (auto_matched or verified)';
