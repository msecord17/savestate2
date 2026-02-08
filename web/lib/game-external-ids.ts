/**
 * Canonical identity: platform external id → games.id.
 * Sync must resolve game_id via game_external_ids first, then IGDB/title-only, then write here.
 */

export type GameExternalIdRow = {
  game_id: string;
  source: string;
  external_id: string;
  confidence?: number | null;
  match_source?: string | null;
  matched_at?: string | null;
};

export function gameExternalIdRow(
  game_id: string,
  source: string,
  external_id: string,
  opts?: { confidence?: number; match_source?: string }
): GameExternalIdRow & { matched_at: string } {
  const now = new Date().toISOString();
  return {
    game_id,
    source,
    external_id,
    confidence: opts?.confidence ?? null,
    match_source: opts?.match_source ?? null,
    matched_at: now,
  };
}

/**
 * Look up game_id by (source, external_id). Returns null if not found.
 */
export async function lookupGameId(
  admin: { from: (t: string) => any },
  source: string,
  external_id: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("game_external_ids")
    .select("game_id")
    .eq("source", source)
    .eq("external_id", String(external_id))
    .maybeSingle();

  if (error) throw new Error(`game_external_ids lookup: ${error.message}`);
  return data?.game_id ? String(data.game_id) : null;
}

/**
 * Upsert game_external_ids. Use after resolving game_id (IGDB or title-only).
 * ignoreDuplicates: true so existing mapping is not overwritten.
 */
export async function upsertGameExternalId(
  admin: { from: (t: string) => any },
  row: GameExternalIdRow & { matched_at?: string }
): Promise<void> {
  const { error } = await admin
    .from("game_external_ids")
    .upsert(
      {
        game_id: row.game_id,
        source: row.source,
        external_id: row.external_id,
        confidence: row.confidence ?? null,
        match_source: row.match_source ?? null,
        matched_at: row.matched_at ?? new Date().toISOString(),
      },
      { onConflict: "source,external_id", ignoreDuplicates: true }
    );

  if (error) throw new Error(`game_external_ids upsert: ${error.message}`);
}
