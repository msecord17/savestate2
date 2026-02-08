/**
 * Platform sync game resolution: no IGDB inline.
 * - Upsert game_external_refs (source, external_id, raw_title).
 * - Get or create placeholder game (title-only); never decide IGDB identity here.
 * - Upsert game_match_queue when mapping missing or stale so a worker can match later.
 */

import { normalizeCanonicalTitle } from "@/lib/igdb/server";
import { lookupGameId, upsertGameExternalId, gameExternalIdRow } from "@/lib/game-external-ids";
import { ensureGameTitleOnly } from "@/lib/igdb/server";
import { getOrCreateGameForXboxApp } from "@/lib/provisional-game";

const now = () => new Date().toISOString();

/**
 * Upsert game_external_refs for (source, external_id). Preserves first_seen_at on update.
 */
export async function upsertGameExternalRef(
  admin: { from: (t: string) => any },
  opts: { source: string; external_id: string; raw_title: string; platform_key?: string | null }
): Promise<void> {
  const source = String(opts.source).trim();
  const external_id = String(opts.external_id).trim();
  const raw_title = String(opts.raw_title ?? "").trim();
  const normalized_title = raw_title ? normalizeCanonicalTitle(raw_title) : "";
  const platform_key = opts.platform_key ?? null;
  const t = now();
  const payload = {
    raw_title: raw_title || external_id,
    normalized_title: normalized_title || raw_title || external_id,
    platform_key,
    last_seen_at: t,
  };

  const { data: existing } = await admin
    .from("game_external_refs")
    .select("id")
    .eq("source", source)
    .eq("external_id", external_id)
    .maybeSingle();

  if (existing) {
    await admin.from("game_external_refs").update(payload).eq("source", source).eq("external_id", external_id);
  } else {
    await admin.from("game_external_refs").insert({
      source,
      external_id,
      ...payload,
      first_seen_at: t,
    });
  }
}

/**
 * Upsert (source, external_id) into game_match_queue so a worker can run IGDB matching later.
 * Idempotent: sets updated_at, leaves attempts/locked_at/last_error as-is when row exists.
 */
export async function enqueueGameMatch(
  admin: { from: (t: string) => any },
  opts: { source: string; external_id: string; priority?: number }
): Promise<void> {
  const source = String(opts.source).trim();
  const external_id = String(opts.external_id).trim();
  const priority = Number(opts.priority ?? 0);
  const t = now();

  await admin
    .from("game_match_queue")
    .upsert(
      {
        source,
        external_id,
        priority,
        updated_at: t,
      },
      {
        onConflict: "source,external_id",
        ignoreDuplicates: false,
      }
    );
}

/** Good statuses: mapping is resolved and should be used for game_id (no re-match). */
const GOOD_MAPPING_STATUSES = ["auto_approved", "manual", "auto", "reviewed", "corrected", "confirmed"];

/**
 * Returns true if (source, external_id) has a mapping that does not need (re-)matching.
 */
async function hasGoodMapping(
  admin: { from: (t: string) => any },
  source: string,
  external_id: string
): Promise<boolean> {
  const { data } = await admin
    .from("game_master_mappings")
    .select("canonical_game_id, igdb_game_id, status")
    .eq("source", source)
    .eq("external_id", String(external_id))
    .maybeSingle();

  if (!data) return false;
  if (data.canonical_game_id != null) return true;
  if (data.igdb_game_id != null && GOOD_MAPPING_STATUSES.includes(String(data.status ?? ""))) return true;
  return false;
}

/**
 * Upsert game_master_mappings on ingest: refresh source_title, source_platform, source_cover_url, last_seen_at.
 * If row is new, set status = 'candidate'. If existing, do not overwrite status/igdb_game_id/canonical_game_id.
 * When mapping is not confirmed/rejected, enqueue for matcher.
 */
export async function upsertGameMasterMappingIngest(
  admin: { from: (t: string) => any },
  opts: {
    source: string;
    external_id: string;
    source_title?: string | null;
    source_platform?: string | null;
    source_cover_url?: string | null;
  }
): Promise<void> {
  const source = String(opts.source).trim();
  const external_id = String(opts.external_id).trim();
  const t = now();

  const { data: existing } = await admin
    .from("game_master_mappings")
    .select("id, status, igdb_game_id, canonical_game_id")
    .eq("source", source)
    .eq("external_id", external_id)
    .maybeSingle();

  const meta = {
    source_title: opts.source_title ?? null,
    source_platform: opts.source_platform ?? null,
    source_cover_url: opts.source_cover_url ?? null,
    last_seen_at: t,
  };

  if (existing) {
    await admin
      .from("game_master_mappings")
      .update(meta)
      .eq("source", source)
      .eq("external_id", external_id);
  } else {
    await admin.from("game_master_mappings").insert({
      source,
      external_id,
      ...meta,
      status: "candidate",
      first_seen_at: t,
    });
  }

  const isResolved =
    existing?.canonical_game_id != null ||
    (existing?.igdb_game_id != null && GOOD_MAPPING_STATUSES.includes(String(existing?.status ?? "")));
  if (!isResolved) {
    await enqueueGameMatch(admin, { source, external_id, priority: 0 });
  }
}

/**
 * Get or create game_id for sync. No IGDB search.
 * Critical: every sync checks game_master_mappings first (read-first, write-later).
 * 1) Upsert game_external_refs.
 * 2) Read game_master_mappings (source, external_id): if canonical_game_id set → use it; else if igdb_game_id + good status → resolve by igdb_game_id.
 * 3) If game_external_ids has (source, external_id) → return that game_id.
 * 4) If isApp → getOrCreateGameForXboxApp (content_type=app), return.
 * 5) Else: ensureGameTitleOnly(raw_title), upsert game_external_ids, enqueue game_match_queue, return game_id.
 */
export async function getOrCreateGameForSync(
  admin: { from: (t: string) => any },
  opts: {
    source: string;
    external_id: string;
    raw_title: string;
    platform_key?: string | null;
    isApp?: boolean;
  }
): Promise<{ game_id: string }> {
  const { source, external_id, raw_title, platform_key, isApp } = opts;
  const raw = String(raw_title ?? "").trim();
  if (!raw && !external_id) throw new Error("sync game resolve: need external_id or raw_title");

  await upsertGameExternalRef(admin, {
    source,
    external_id: String(external_id),
    raw_title: raw || String(external_id),
    platform_key,
  });

  const extId = String(external_id);

  const { data: mapping } = await admin
    .from("game_master_mappings")
    .select("canonical_game_id, igdb_game_id, status")
    .eq("source", source)
    .eq("external_id", extId)
    .maybeSingle();

  if (mapping?.canonical_game_id != null) {
    const gameId = String(mapping.canonical_game_id);
    await upsertGameExternalId(admin, gameExternalIdRow(gameId, source, extId, { match_source: "master_mapping", confidence: 1 }));
    return { game_id: gameId };
  }

  if (mapping?.igdb_game_id != null && GOOD_MAPPING_STATUSES.includes(String(mapping.status ?? ""))) {
    const { data: gameRow } = await admin
      .from("games")
      .select("id")
      .eq("igdb_game_id", Number(mapping.igdb_game_id))
      .maybeSingle();
    if (gameRow?.id) {
      await upsertGameExternalId(admin, gameExternalIdRow(gameRow.id, source, extId, { match_source: "master_mapping", confidence: 1 }));
      return { game_id: gameRow.id };
    }
  }

  const existingGameId = await lookupGameId(admin, source, extId);
  if (existingGameId) {
    const good = await hasGoodMapping(admin, source, extId);
    if (!good) await enqueueGameMatch(admin, { source, external_id: extId, priority: 0 });
    return { game_id: existingGameId };
  }

  if (isApp) {
    const res = await getOrCreateGameForXboxApp(admin, { source, external_id: extId, title: raw || extId });
    return res;
  }

  const title = raw || extId;
  const { game_id } = await ensureGameTitleOnly(admin, title);
  await admin.from("games").update({ match_status: "provisional", updated_at: now() }).eq("id", game_id);
  await upsertGameExternalId(admin, gameExternalIdRow(game_id, source, extId, { match_source: "title_only", confidence: 0 }));
  await enqueueGameMatch(admin, { source, external_id: extId, priority: 0 });

  return { game_id };
}
