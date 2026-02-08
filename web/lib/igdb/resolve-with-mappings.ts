/**
 * Resolve game using game_master_mappings before IGDB.
 * If mapping exists with igdb_game_id: use it (never overwrite canonical_title if it would violate uniqueness).
 * If no mapping: search top 5, score, write mapping with status='proposed', method='auto'; only write games.igdb_game_id if confidence >= 0.92.
 * Non-regression: if mapping exists and new confidence <= old + 0.05 → do nothing. If mapping is confirmed → never auto-change.
 */

import {
  normalizeCanonicalTitle,
  cleanTitleForIgdb,
  expandCommonAbbrevsForSearch,
  igdbSearchCandidates,
  pickBestCandidate,
  igdbFetchGameById,
} from "./server";

const MASTER_MAPPING_CONFIDENCE_GATE = 0.92;
const NON_REGRESSION_DELTA = 0.05;

export type MappingRow = {
  id: string;
  platform_key: string;
  external_id: string;
  igdb_game_id: number | null;
  confidence: number | null;
  chosen_igdb_name: string | null;
  chosen_igdb_year: number | null;
  status: string;
  method: string;
};

export async function lookupGameMasterMapping(
  admin: { from: (t: string) => any },
  platform_key: string,
  external_id: string
): Promise<MappingRow | null> {
  const { data, error } = await admin
    .from("game_master_mappings")
    .select("id, platform_key, external_id, igdb_game_id, confidence, chosen_igdb_name, chosen_igdb_year, status, method")
    .eq("platform_key", platform_key)
    .eq("external_id", String(external_id))
    .maybeSingle();
  if (error || !data) return null;
  return data as MappingRow;
}

/** Resolve game by igdb_game_id; update metadata but never overwrite canonical_title if it would violate uniqueness. */
export async function resolveGameByIgdbIdFromMapping(
  admin: { from: (t: string) => any },
  igdbGameId: number,
  rawTitle: string
): Promise<{ game_id: string; igdb_game_id: number }> {
  const hit = await igdbFetchGameById(igdbGameId);
  if (!hit) {
    const g = await getOrCreateTitleOnlyGame(admin, rawTitle);
    return { game_id: g.game_id, igdb_game_id: igdbGameId };
  }

  const { shouldOverwriteCover } = await import("./server");
  const now = new Date().toISOString();
  const canonicalFromHit = normalizeCanonicalTitle(String(hit.title || rawTitle).trim() || rawTitle);

  const patch: Record<string, unknown> = {
    igdb_game_id: hit.igdb_game_id,
    updated_at: now,
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
    .select("id, cover_url, canonical_title")
    .eq("igdb_game_id", igdbGameId)
    .maybeSingle();

  if (existingByIgdb?.id) {
    if (existingByIgdb.cover_url && !shouldOverwriteCover(existingByIgdb.cover_url as string))
      delete patch.cover_url;
    await admin.from("games").update(patch).eq("id", existingByIgdb.id);
    return { game_id: String(existingByIgdb.id), igdb_game_id: igdbGameId };
  }

  const { data: existingByTitle } = await admin
    .from("games")
    .select("id, cover_url, canonical_title")
    .eq("canonical_title", canonicalFromHit)
    .maybeSingle();

  if (existingByTitle?.id) {
    if (existingByTitle.cover_url && !shouldOverwriteCover(existingByTitle.cover_url as string))
      delete patch.cover_url;
    await admin.from("games").update(patch).eq("id", existingByTitle.id);
    return { game_id: String(existingByTitle.id), igdb_game_id: igdbGameId };
  }

  const { data: conflictByCanonical } = await admin
    .from("games")
    .select("id")
    .eq("canonical_title", canonicalFromHit)
    .maybeSingle();

  if (!conflictByCanonical?.id) {
    patch.canonical_title = canonicalFromHit;
  }

  const { data: inserted, error } = await admin.from("games").insert(patch).select("id").single();
  if (error) {
    if ((error as { code?: string })?.code === "23505") {
      const { data: existing } = await admin
        .from("games")
        .select("id")
        .eq("igdb_game_id", igdbGameId)
        .maybeSingle();
      if (existing?.id) return { game_id: String(existing.id), igdb_game_id: igdbGameId };
      const { data: byTitle } = await admin
        .from("games")
        .select("id")
        .eq("canonical_title", canonicalFromHit)
        .maybeSingle();
      if (byTitle?.id) return { game_id: String(byTitle.id), igdb_game_id: igdbGameId };
    }
    throw new Error(`game insert: ${error.message}`);
  }
  return { game_id: String(inserted.id), igdb_game_id: igdbGameId };
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

/**
 * Resolve game with mapping-first: lookup game_master_mappings(platform_key, external_id).
 * If mapping has igdb_game_id: use it (confirmed → never auto-change).
 * Else: IGDB search top 5, score, write mapping (proposed, auto); only write games.igdb_game_id if confidence >= 0.92.
 * Non-regression: if mapping exists and new confidence <= old + 0.05 → do nothing.
 */
export async function resolveGameWithMappings(
  admin: { from: (t: string) => any },
  opts: {
    platform_key: string;
    external_id: string;
    title: string;
  }
): Promise<{ game_id: string; igdb_game_id: number | null }> {
  const { platform_key, external_id, title } = opts;
  const raw = String(title || "").trim();
  if (!raw) throw new Error("title empty");

  const mapping = await lookupGameMasterMapping(admin, platform_key, external_id);

  if (mapping?.status === "confirmed") {
    if (mapping.igdb_game_id != null) {
      return resolveGameByIgdbIdFromMapping(admin, Number(mapping.igdb_game_id), raw);
    }
    const g = await getOrCreateTitleOnlyGame(admin, raw);
    return { game_id: g.game_id, igdb_game_id: null };
  }

  if (mapping?.igdb_game_id != null) {
    return resolveGameByIgdbIdFromMapping(admin, Number(mapping.igdb_game_id), raw);
  }

  const expanded = expandCommonAbbrevsForSearch(cleanTitleForIgdb(raw));
  const searchTitle = expanded || raw;
  const candidates = await igdbSearchCandidates(searchTitle, { rawTitle: raw, limit: 5 });
  const cleaned = cleanTitleForIgdb(raw);
  const yearHint = raw.match(/\b(19|20)\d{2}\b/)?.[0]
    ? parseInt(raw.match(/\b(19|20)\d{2}\b/)![0], 10)
    : undefined;
  const result = pickBestCandidate(candidates, raw, cleaned || raw, yearHint);
  const scored = "scored" in result ? result.scored : [];
  const best = scored[0];
  const confidence = best?.score ?? 0;
  const chosenHit = best?.hit ?? null;

  if (mapping && confidence <= (mapping.confidence ?? 0) + NON_REGRESSION_DELTA) {
    const g = await getOrCreateTitleOnlyGame(admin, raw);
    return { game_id: g.game_id, igdb_game_id: null };
  }

  const now = new Date().toISOString();
  const mappingPayload = {
    platform_key,
    external_id: String(external_id),
    igdb_game_id: chosenHit?.igdb_game_id ?? null,
    confidence,
    chosen_igdb_name: chosenHit?.title ?? null,
    chosen_igdb_year: chosenHit?.first_release_year ?? null,
    status: "proposed",
    method: "auto",
    updated_at: now,
  };

  if (mapping?.id) {
    await admin
      .from("game_master_mappings")
      .update(mappingPayload)
      .eq("id", mapping.id);
  } else {
    const { error: insErr } = await admin.from("game_master_mappings").insert({
      ...mappingPayload,
      created_at: now,
    });
    if (insErr && (insErr as { code?: string })?.code !== "23505") {
      console.warn("[game_master_mappings] insert failed:", (insErr as Error).message);
    }
  }

  if (confidence >= MASTER_MAPPING_CONFIDENCE_GATE && chosenHit?.igdb_game_id) {
    return resolveGameByIgdbIdFromMapping(admin, Number(chosenHit.igdb_game_id), raw);
  }

  const g = await getOrCreateTitleOnlyGame(admin, raw);
  return { game_id: g.game_id, igdb_game_id: null };
}
