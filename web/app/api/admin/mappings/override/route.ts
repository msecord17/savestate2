import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { igdbFetchGameById, normalizeCanonicalTitle } from "@/lib/igdb/server";
import { upsertGameExternalId, gameExternalIdRow } from "@/lib/game-external-ids";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/admin/mappings/override
 * Body: { source: string, external_id: string, igdb_game_id: number, locked?: boolean }
 * Set or upsert game_master_mappings by (source, external_id): set igdb_game_id, resolve game,
 * set status = 'confirmed' when locked !== false. Same effect as approve but keyed by source + external_id.
 */
export async function POST(req: Request) {
  let body: { source?: string; external_id?: string; igdb_game_id?: number; locked?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const source = typeof body?.source === "string" ? body.source.trim() : "";
  const external_id = typeof body?.external_id === "string" ? body.external_id.trim() : "";
  const igdbGameId = body?.igdb_game_id != null ? Number(body.igdb_game_id) : null;
  const locked = body?.locked !== false;

  if (!source || !external_id) {
    return NextResponse.json(
      { error: "Missing or invalid source and external_id" },
      { status: 400 }
    );
  }
  if (!Number.isFinite(igdbGameId) || igdbGameId <= 0) {
    return NextResponse.json(
      { error: "Missing or invalid igdb_game_id" },
      { status: 400 }
    );
  }

  const admin = adminClient();
  const now = new Date().toISOString();

  const hit = await igdbFetchGameById(igdbGameId);
  if (!hit) {
    return NextResponse.json({ error: "IGDB game not found" }, { status: 404 });
  }

  const canonicalTitle = normalizeCanonicalTitle(String(hit.title || "").trim());
  const patch: Record<string, unknown> = {
    igdb_game_id: igdbGameId,
    canonical_title: canonicalTitle,
    summary: hit.summary ?? null,
    developer: hit.developer ?? null,
    publisher: hit.publisher ?? null,
    first_release_year: hit.first_release_year ?? null,
    cover_url: hit.cover_url ?? null,
    igdb_category: hit.category ?? null,
    genres: Array.isArray(hit.genres) ? hit.genres : null,
    match_status: "verified",
    match_method: "manual",
    matched_at: now,
    updated_at: now,
  };

  const { data: extRow } = await admin
    .from("game_external_ids")
    .select("game_id")
    .eq("source", source)
    .eq("external_id", external_id)
    .maybeSingle();
  const placeholderGameId = extRow?.game_id ? String(extRow.game_id) : null;

  const { data: existingByIgdb } = await admin
    .from("games")
    .select("id")
    .eq("igdb_game_id", igdbGameId)
    .maybeSingle();

  let resolvedGameId: string | null = null;

  if (existingByIgdb?.id && placeholderGameId && existingByIgdb.id !== placeholderGameId) {
    resolvedGameId = existingByIgdb.id;
    await admin
      .from("releases")
      .update({ game_id: existingByIgdb.id, updated_at: now })
      .eq("game_id", placeholderGameId);
    await admin
      .from("game_external_ids")
      .update({ game_id: existingByIgdb.id })
      .eq("source", source)
      .eq("external_id", external_id);
    await admin.from("games").delete().eq("id", placeholderGameId);
    await admin.from("games").update(patch).eq("id", existingByIgdb.id);
  } else if (placeholderGameId) {
    resolvedGameId = placeholderGameId;
    const { data: gameRow } = await admin
      .from("games")
      .select("cover_url")
      .eq("id", placeholderGameId)
      .maybeSingle();
    if (
      gameRow?.cover_url &&
      !String(gameRow.cover_url).toLowerCase().includes("placeholder") &&
      !String(gameRow.cover_url).toLowerCase().includes("unknown")
    ) {
      delete patch.cover_url;
    }
    await admin.from("games").update(patch).eq("id", placeholderGameId);
    await upsertGameExternalId(
      admin,
      gameExternalIdRow(placeholderGameId, source, external_id, {
        match_source: "manual",
        confidence: 1,
      })
    );
  } else {
    const { data: inserted } = await admin
      .from("games")
      .insert({
        ...patch,
        canonical_title: canonicalTitle || "Unknown",
      })
      .select("id")
      .single();
    if (inserted?.id) {
      resolvedGameId = inserted.id;
      await upsertGameExternalId(
        admin,
        gameExternalIdRow(inserted.id, source, external_id, {
          match_source: "manual",
          confidence: 1,
        })
      );
    }
  }

  const status = locked ? "confirmed" : "needs_review";
  const mappingPayload = {
    source,
    external_id,
    igdb_game_id: igdbGameId,
    status,
    confidence: 1,
    method: "manual",
    matched_name: hit.title ?? null,
    matched_year: hit.first_release_year ?? null,
    matched_at: now,
    ...(resolvedGameId && { canonical_game_id: resolvedGameId }),
    last_seen_at: now,
    updated_at: now,
    ...(locked && { confirmed_at: now }),
  };

  const { data: upserted, error: upsertErr } = await admin
    .from("game_master_mappings")
    .upsert(mappingPayload, {
      onConflict: "source,external_id",
    })
    .select("id")
    .single();

  if (upsertErr) {
    return NextResponse.json(
      { error: (upsertErr as Error).message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    mapping_id: upserted?.id,
    source,
    external_id,
    igdb_game_id: igdbGameId,
    status,
    canonical_game_id: resolvedGameId ?? undefined,
  });
}
