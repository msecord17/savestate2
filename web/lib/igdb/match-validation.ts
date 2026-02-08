/**
 * Match-validation layer: do not commit IGDB matches on first search.
 * Store candidates + confidence + reasons; only write games.igdb_game_id/cover_url
 * when confidence passes threshold and validations succeed (token overlap, bundle mismatch reject, category guardrail).
 * game_match_attempts provides audit + replay.
 */

import {
  normalizeCanonicalTitle,
  cleanTitleForIgdb,
  expandCommonAbbrevsForSearch,
  igdbSearchCandidates,
  isXboxNonGame,
} from "./server";
import type { IgdbHit } from "./server";

const CONFIDENCE_THRESHOLD = 0.7;
/** IGDB category 0 = main_game. Reject dlc/bundle/expansion for canonical game. */
const MAIN_GAME_CATEGORY = 0;

const BUNDLE_KEYWORDS = /\b(bundle|collection|pack|anthology|compilation|goty|game of the year|edition)\b/i;

export type MatchReasons = {
  token_overlap?: number;
  bundle_mismatch?: boolean;
  category_guardrail?: boolean;
  year_match?: boolean;
};

export type ScoredCandidate = {
  hit: IgdbHit;
  confidence: number;
  reasons: MatchReasons;
};

function tokenize(s: string): string[] {
  return Array.from(
    new Set(
      String(s || "")
        .toLowerCase()
        .replace(/™|®|©/g, "")
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 2)
    )
  );
}

function tokenOverlapScore(queryTokens: string[], nameTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  let match = 0;
  for (const t of queryTokens) {
    if (nameTokens.includes(t)) match++;
  }
  return match / queryTokens.length;
}

/** Reject when query is a single title but IGDB hit looks like a bundle/collection (or vice versa). */
function bundleMismatch(queryTitle: string, hitTitle: string): boolean {
  const q = String(queryTitle || "").toLowerCase();
  const h = String(hitTitle || "").toLowerCase();
  const qHasBundle = BUNDLE_KEYWORDS.test(q);
  const hHasBundle = BUNDLE_KEYWORDS.test(h);
  if (qHasBundle === hHasBundle) return false;
  return true;
}

function categoryGuardrail(hit: IgdbHit): boolean {
  if (hit.category == null) return true;
  return hit.category === MAIN_GAME_CATEGORY;
}

/**
 * Score one candidate: confidence 0..1 and reasons. Only pass when confidence >= threshold
 * and !bundleMismatch and categoryGuardrail.
 */
export function scoreCandidate(hit: IgdbHit, queryTitle: string): ScoredCandidate {
  const reasons: MatchReasons = {};
  const queryTokens = tokenize(cleanTitleForIgdb(queryTitle));
  const nameTokens = tokenize(hit.title);
  const overlap = tokenOverlapScore(queryTokens, nameTokens);
  reasons.token_overlap = overlap;

  let confidence = overlap;
  if (overlap >= 0.5) confidence += 0.2;
  if (hit.first_release_year != null) {
    const yearInQuery = queryTitle.match(/\b(19|20)\d{2}\b/);
    if (yearInQuery && hit.first_release_year === parseInt(yearInQuery[0], 10)) {
      reasons.year_match = true;
      confidence += 0.15;
    }
  }
  confidence = Math.min(1, confidence);

  const bundleReject = bundleMismatch(queryTitle, hit.title);
  if (bundleReject) reasons.bundle_mismatch = true;

  const categoryReject = !categoryGuardrail(hit);
  if (categoryReject) reasons.category_guardrail = true;

  return { hit, confidence, reasons };
}

/**
 * Check manual override (source, external_id) -> igdb_game_id. Returns igdb_game_id or null.
 */
export async function lookupManualOverride(
  admin: { from: (t: string) => any },
  source: string,
  external_id: string
): Promise<number | null> {
  const { data, error } = await admin
    .from("manual_igdb_overrides")
    .select("igdb_game_id")
    .eq("source", source)
    .eq("external_id", String(external_id))
    .maybeSingle();
  if (error) return null;
  return data?.igdb_game_id != null ? Number(data.igdb_game_id) : null;
}

/**
 * Insert a game_match_attempt row for audit/replay.
 */
export async function insertMatchAttempt(
  admin: { from: (t: string) => any },
  row: {
    source: string;
    external_id: string;
    title_used?: string | null;
    game_id?: string | null;
    igdb_game_id_candidate?: number | null;
    confidence?: number | null;
    reasons_json?: Record<string, unknown> | null;
    outcome: string;
    resolved_at?: string | null;
  }
): Promise<void> {
  const { error } = await admin.from("game_match_attempts").insert({
    source: row.source,
    external_id: row.external_id,
    title_used: row.title_used ?? null,
    game_id: row.game_id ?? null,
    igdb_game_id_candidate: row.igdb_game_id_candidate ?? null,
    confidence: row.confidence ?? null,
    reasons_json: row.reasons_json ?? null,
    outcome: row.outcome,
    resolved_at: row.resolved_at ?? null,
  });
  if (error) console.warn("[game_match_attempts] insert failed:", error.message);
}

/**
 * Resolve game with validation: manual override first, then Xbox non-game filter, then IGDB candidates
 * with confidence + guardrails; only commit igdb_game_id/cover when threshold and validations pass.
 * Writes to game_match_attempts for audit.
 */
export async function resolveGameWithValidation(
  admin: { from: (t: string) => any },
  opts: {
    source: string;
    external_id: string;
    title: string;
    platform_key?: string;
  }
): Promise<{ game_id: string; igdb_game_id: number | null }> {
  const { source, external_id, title, platform_key } = opts;
  const raw = String(title || "").trim();
  if (!raw) throw new Error("title empty");

  const canonicalNorm = normalizeCanonicalTitle(raw);

  // 1) Manual override: resolve by igdb_game_id only
  const overrideIgdbId = await lookupManualOverride(admin, source, external_id);
  if (overrideIgdbId != null) {
    const game = await resolveGameByIgdbId(admin, overrideIgdbId, raw);
    await insertMatchAttempt(admin, {
      source,
      external_id,
      title_used: raw,
      game_id: game.game_id,
      igdb_game_id_candidate: overrideIgdbId,
      confidence: 1,
      reasons_json: { manual_override: true },
      outcome: "accepted",
      resolved_at: new Date().toISOString(),
    });
    return game;
  }

  // 2) Xbox app/non-game: never send to IGDB
  const xboxNonGame = platform_key === "xbox" && isXboxNonGame(raw);
  if (xboxNonGame) {
    const game = await getOrCreateTitleOnlyGame(admin, raw);
    await insertMatchAttempt(admin, {
      source,
      external_id,
      title_used: raw,
      game_id: game.game_id,
      outcome: "skipped",
      reasons_json: { xbox_non_game: true },
      resolved_at: new Date().toISOString(),
    });
    return { game_id: game.game_id, igdb_game_id: null };
  }

  // 3) Get candidates (no commit yet)
  const expanded = expandCommonAbbrevsForSearch(cleanTitleForIgdb(raw));
  const searchTitle = expanded || raw;
  const candidates = await igdbSearchCandidates(searchTitle, { rawTitle: raw, limit: 10 });

  if (candidates.length === 0) {
    const game = await getOrCreateTitleOnlyGame(admin, raw);
    await insertMatchAttempt(admin, {
      source,
      external_id,
      title_used: raw,
      game_id: game.game_id,
      outcome: "rejected",
      reasons_json: { no_candidates: true },
      resolved_at: new Date().toISOString(),
    });
    return { game_id: game.game_id, igdb_game_id: null };
  }

  const scored = candidates.map((hit) => scoreCandidate(hit, raw));
  const valid = scored.filter(
    (s) =>
      s.confidence >= CONFIDENCE_THRESHOLD &&
      !s.reasons.bundle_mismatch &&
      !s.reasons.category_guardrail
  );
  const best = valid[0] ?? scored[0];

  if (
    best.confidence >= CONFIDENCE_THRESHOLD &&
    !best.reasons.bundle_mismatch &&
    !best.reasons.category_guardrail
  ) {
    const game = await commitIgdbMatch(admin, best.hit, raw);
    await insertMatchAttempt(admin, {
      source,
      external_id,
      title_used: raw,
      game_id: game.game_id,
      igdb_game_id_candidate: best.hit.igdb_game_id,
      confidence: best.confidence,
      reasons_json: best.reasons,
      outcome: "accepted",
      resolved_at: new Date().toISOString(),
    });
    return { game_id: game.game_id, igdb_game_id: best.hit.igdb_game_id };
  }

  const game = await getOrCreateTitleOnlyGame(admin, raw);
  await insertMatchAttempt(admin, {
    source,
    external_id,
    title_used: raw,
    game_id: game.game_id,
    igdb_game_id_candidate: best.hit.igdb_game_id,
    confidence: best.confidence,
    reasons_json: best.reasons,
    outcome: "rejected",
    resolved_at: new Date().toISOString(),
  });
  return { game_id: game.game_id, igdb_game_id: null };
}

async function resolveGameByIgdbId(
  admin: { from: (t: string) => any },
  igdbGameId: number,
  rawTitle: string
): Promise<{ game_id: string; igdb_game_id: number }> {
  const { igdbFetchGameById } = await import("./server");
  const hit = await igdbFetchGameById(igdbGameId);
  if (hit) return commitIgdbMatch(admin, hit, rawTitle);
  const g = await getOrCreateTitleOnlyGame(admin, rawTitle);
  return { game_id: g.game_id, igdb_game_id: igdbGameId };
}

async function commitIgdbMatch(
  admin: { from: (t: string) => any },
  hit: IgdbHit,
  rawTitle: string
): Promise<{ game_id: string; igdb_game_id: number }> {
  const { shouldOverwriteCover } = await import("./server");
  const canonical = normalizeCanonicalTitle(String(hit.title || rawTitle).trim() || rawTitle);
  const patch: Record<string, unknown> = {
    igdb_game_id: hit.igdb_game_id,
    canonical_title: canonical,
    updated_at: new Date().toISOString(),
  };
  if (hit.summary != null) patch.summary = hit.summary;
  if (hit.developer != null) patch.developer = hit.developer;
  if (hit.publisher != null) patch.publisher = hit.publisher;
  if (hit.first_release_year != null) patch.first_release_year = hit.first_release_year;
  if (hit.cover_url) patch.cover_url = hit.cover_url;
  if (Array.isArray(hit.genres) && hit.genres.length) patch.genres = hit.genres;
  if (hit.category != null) patch.igdb_category = hit.category;

  const { data: existingByIgdb } = await admin
    .from("games")
    .select("id, cover_url")
    .eq("igdb_game_id", hit.igdb_game_id)
    .maybeSingle();

  if (existingByIgdb?.id) {
    if (existingByIgdb.cover_url && !shouldOverwriteCover(existingByIgdb.cover_url))
      delete patch.cover_url;
    await admin.from("games").update(patch).eq("id", existingByIgdb.id);
    return { game_id: String(existingByIgdb.id), igdb_game_id: hit.igdb_game_id };
  }

  const { data: existingByTitle } = await admin
    .from("games")
    .select("id, cover_url")
    .eq("canonical_title", canonical)
    .maybeSingle();

  if (existingByTitle?.id) {
    if (existingByTitle.cover_url && !shouldOverwriteCover(existingByTitle.cover_url))
      delete patch.cover_url;
    await admin.from("games").update(patch).eq("id", existingByTitle.id);
    return { game_id: String(existingByTitle.id), igdb_game_id: hit.igdb_game_id };
  }

  const { data: inserted, error } = await admin.from("games").insert(patch).select("id").single();
  if (error) {
    if ((error as { code?: string })?.code === "23505") {
      const { data: existing } = await admin
        .from("games")
        .select("id")
        .eq("igdb_game_id", hit.igdb_game_id)
        .maybeSingle();
      if (existing?.id) return { game_id: String(existing.id), igdb_game_id: hit.igdb_game_id };
      const { data: byTitle } = await admin
        .from("games")
        .select("id")
        .eq("canonical_title", canonical)
        .maybeSingle();
      if (byTitle?.id) return { game_id: String(byTitle.id), igdb_game_id: hit.igdb_game_id };
    }
    throw new Error(`game insert: ${error.message}`);
  }
  return { game_id: String(inserted.id), igdb_game_id: hit.igdb_game_id };
}

async function getOrCreateTitleOnlyGame(
  admin: { from: (t: string) => any },
  rawTitle: string
): Promise<{ game_id: string }> {
  const normalized = normalizeCanonicalTitle(rawTitle);
  const { data: existing } = await admin
    .from("games")
    .select("id")
    .eq("canonical_title", normalized)
    .maybeSingle();
  if (existing?.id) return { game_id: String(existing.id) };

  const { data: inserted, error } = await admin
    .from("games")
    .insert({ canonical_title: normalized })
    .select("id")
    .single();
  if (error) {
    if ((error as { code?: string })?.code === "23505") {
      const { data: raced } = await admin
        .from("games")
        .select("id")
        .eq("canonical_title", normalized)
        .maybeSingle();
      if (raced?.id) return { game_id: String(raced.id) };
    }
    throw new Error(`game insert: ${error.message}`);
  }
  return { game_id: String(inserted.id) };
}
