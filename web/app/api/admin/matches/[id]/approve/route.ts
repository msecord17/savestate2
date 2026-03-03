import { NextResponse } from "next/server";
import { igdbFetchGameById, normalizeCanonicalTitle } from "@/lib/igdb/server";
import { upsertGameExternalId, gameExternalIdRow } from "@/lib/game-external-ids";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

/**
 * POST /api/admin/matches/[id]/approve
 * Body: { igdb_game_id: number }
 * Mark mapping as manual + set igdb_game_id; ensure game exists, repoint releases, fill cover + metadata.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const { id } = await params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  let body: { igdb_game_id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawIgdb = body?.igdb_game_id;

  if (rawIgdb == null) {
    return NextResponse.json(
      { error: "Missing or invalid igdb_game_id" },
      { status: 400 }
    );
  }

  const igdbGameId = Number(rawIgdb);

  if (!Number.isFinite(igdbGameId) || igdbGameId <= 0) {
    return NextResponse.json(
      { error: "Missing or invalid igdb_game_id" },
      { status: 400 }
    );
  }

  const admin = adminClient();
  const now = new Date().toISOString();

  const { data: mapping, error: fetchErr } = await admin
    .from("game_master_mappings")
    .select("id, source, external_id, status")
    .eq("id", id.trim())
    .single();

  if (fetchErr || !mapping) {
    return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
  }

  const source = String(mapping.source);
  const external_id = String(mapping.external_id);

  const { data: extRow } = await admin
    .from("game_external_ids")
    .select("game_id")
    .eq("source", source)
    .eq("external_id", external_id)
    .maybeSingle();
  const placeholderGameId = extRow?.game_id ? String(extRow.game_id) : null;

  const hit = await igdbFetchGameById(igdbGameId);
  if (!hit) return NextResponse.json({ error: "IGDB game not found" }, { status: 404 });

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
    const { data: gameRow } = await admin.from("games").select("cover_url").eq("id", placeholderGameId).single();
    if (gameRow?.cover_url && !String(gameRow.cover_url).toLowerCase().includes("placeholder") && !String(gameRow.cover_url).toLowerCase().includes("unknown")) {
      delete patch.cover_url;
    }
    await admin.from("games").update(patch).eq("id", placeholderGameId);
    await upsertGameExternalId(admin, gameExternalIdRow(placeholderGameId, source, external_id, { match_source: "manual", confidence: 1 }));
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
      await upsertGameExternalId(admin, gameExternalIdRow(inserted.id, source, external_id, { match_source: "manual", confidence: 1 }));
    }
  }

  await admin
    .from("game_master_mappings")
    .update({
      igdb_game_id: igdbGameId,
      status: "confirmed",
      confidence: 1,
      method: "manual",
      matched_name: hit.title ?? null,
      matched_year: hit.first_release_year ?? null,
      ...(resolvedGameId && { canonical_game_id: resolvedGameId }),
      confirmed_at: now,
      updated_at: now,
    })
    .eq("id", id.trim());

  return NextResponse.json({
    ok: true,
    mapping_id: id,
    igdb_game_id: igdbGameId,
    status: "confirmed",
  });
}
