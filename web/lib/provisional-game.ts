/**
 * Step 2: Sync creates releases/observations immediately but does NOT call IGDB.
 * If no existing game is confidently known: create game without igdb_game_id, mark provisional, enqueue match attempt.
 * games.igdb_game_id is ONLY set by the resolver (Step 3) from an accepted match.
 * Xbox apps: use getOrCreateGameForXboxApp to get/create game with content_type='app', no IGDB enqueue.
 */

import { ensureGameTitleOnly } from "@/lib/igdb/server";
import {
  lookupGameId,
  upsertGameExternalId,
  gameExternalIdRow,
} from "@/lib/game-external-ids";

/**
 * Get or create a game for sync: use existing mapping if present; otherwise create title-only game,
 * mark provisional, and enqueue a match attempt (outcome='pending'). Never calls IGDB.
 * Returns game_id. Sync then creates release and observation.
 */
export async function getOrCreateProvisionalGameAndEnqueue(
  admin: { from: (t: string) => any },
  opts: { source: string; external_id: string; title: string }
): Promise<{ game_id: string }> {
  const { source, external_id, title } = opts;
  const raw = String(title || "").trim();
  if (!raw) throw new Error("title empty");

  const existingGameId = await lookupGameId(admin, source, external_id);
  if (existingGameId) {
    return { game_id: existingGameId };
  }

  const { game_id } = await ensureGameTitleOnly(admin, raw);
  const gameId = game_id;

  const { data: gameRow } = await admin
    .from("games")
    .select("id, igdb_game_id")
    .eq("id", gameId)
    .single();

  if (gameRow?.igdb_game_id != null) {
    await upsertGameExternalId(admin, gameExternalIdRow(gameId, source, external_id, { match_source: "igdb_exact", confidence: 1 }));
    return { game_id: gameId };
  }

  await admin
    .from("games")
    .update({ match_status: "provisional", updated_at: new Date().toISOString() })
    .eq("id", gameId);

  await upsertGameExternalId(admin, gameExternalIdRow(gameId, source, external_id, { match_source: "title_only", confidence: 0.8 }));

  await admin.from("game_match_attempts").insert({
    source,
    external_id: String(external_id),
    title_used: raw,
    game_id: gameId,
    igdb_game_id_candidate: null,
    confidence: null,
    reasons_json: null,
    outcome: "pending",
  });

  return { game_id: gameId };
}

/**
 * Get or create a game for an Xbox app (non-game): no IGDB, no match enqueue.
 * Sets games.content_type = 'app' so identity/timeline excludes it.
 */
export async function getOrCreateGameForXboxApp(
  admin: { from: (t: string) => any },
  opts: { source: string; external_id: string; title: string }
): Promise<{ game_id: string }> {
  const { source, external_id, title } = opts;
  const raw = String(title || "").trim();
  if (!raw) throw new Error("title empty");

  const existingGameId = await lookupGameId(admin, source, external_id);
  if (existingGameId) {
    await admin.from("games").update({ content_type: "app", updated_at: new Date().toISOString() }).eq("id", existingGameId);
    return { game_id: existingGameId };
  }

  const { game_id } = await ensureGameTitleOnly(admin, raw);
  await admin.from("games").update({ content_type: "app", updated_at: new Date().toISOString() }).eq("id", game_id);
  await upsertGameExternalId(admin, gameExternalIdRow(game_id, source, external_id, { match_source: "xbox_app", confidence: 0 }));
  return { game_id };
}
