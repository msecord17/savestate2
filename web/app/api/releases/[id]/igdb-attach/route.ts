import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";
import { igdbFetchGameById, normalizeCanonicalTitle } from "@/lib/igdb/server";

/**
 * POST /api/releases/[id]/igdb-attach
 * Body: { igdb_game_id: number }
 * Force-attach the given IGDB game to this release's game. Writes override + remaps.
 * Admin only.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.res;

    const { id: releaseId } = await ctx.params;
    if (!releaseId) {
      return NextResponse.json({ error: "Missing release id" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const igdbGameIdRaw = body?.igdb_game_id ?? body?.igdbGameId;
    const igdbGameId = igdbGameIdRaw != null ? Number(igdbGameIdRaw) : NaN;
    if (!Number.isFinite(igdbGameId) || igdbGameId <= 0) {
      return NextResponse.json(
        { error: "Missing or invalid igdb_game_id" },
        { status: 400 }
      );
    }

    const admin = adminClient();

    const { data: release, error: relErr } = await admin
      .from("releases")
      .select("id, platform_key, game_id, display_title")
      .eq("id", releaseId)
      .maybeSingle();

    if (relErr || !release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const gameId = (release as any)?.game_id;
    if (!gameId) {
      return NextResponse.json({ error: "Release has no game" }, { status: 400 });
    }

    const platformKey = String((release as any)?.platform_key ?? "").trim();
    const { data: extRows } = await admin
      .from("release_external_ids")
      .select("source, external_id")
      .eq("release_id", releaseId);

    const extRow = (extRows ?? []).find(
      (r: any) => (r?.source ?? "") === platformKey
    ) ?? extRows?.[0];
    const externalId = extRow ? String(extRow.external_id ?? "").trim() : releaseId;

    const now = new Date().toISOString();

    if (platformKey && externalId) {
      await admin.from("igdb_match_overrides").upsert(
        {
          platform_key: platformKey,
          external_id: externalId,
          igdb_game_id: igdbGameId,
          created_by: gate.user?.email ?? null,
        },
        { onConflict: "platform_key,external_id" }
      );
    }

    const meta = await igdbFetchGameById(igdbGameId);
    const rawTitle = ((release as any)?.display_title ?? "").trim() || "Unknown";
    const canonical = meta
      ? normalizeCanonicalTitle(String(meta.title || rawTitle).trim() || rawTitle)
      : normalizeCanonicalTitle(rawTitle);

    const patch: Record<string, unknown> = {
      igdb_game_id: igdbGameId,
      canonical_title: canonical,
      updated_at: now,
      match_status: "override",
      match_method: "override",
      matched_at: now,
    };
    if (meta?.summary != null) patch.summary = meta.summary;
    if (meta?.developer != null) patch.developer = meta.developer;
    if (meta?.publisher != null) patch.publisher = meta.publisher;
    if (meta?.first_release_year != null) patch.first_release_year = meta.first_release_year;
    if (Array.isArray(meta?.genres) && meta.genres.length) patch.genres = meta.genres;
    if (meta?.cover_url) patch.cover_url = meta.cover_url;
    if (meta?.category != null) patch.igdb_category = meta.category;

    const { data: otherGame } = await admin
      .from("games")
      .select("id")
      .eq("igdb_game_id", igdbGameId)
      .neq("id", gameId)
      .maybeSingle();
    if (otherGame?.id) {
      await admin.from("games").update({ igdb_game_id: null, updated_at: now }).eq("id", otherGame.id);
    }

    // Always update cover when admin explicitly attaches a new IGDB game (user intent)
    const { error: updErr } = await admin.from("games").update(patch).eq("id", gameId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Propagate cover to release so hero image updates immediately
    if (meta?.cover_url) {
      await admin.from("releases").update({ cover_url: meta.cover_url, updated_at: now }).eq("id", releaseId);
    }

    return NextResponse.json({
      ok: true,
      remapped: { release_id: releaseId, game_id: gameId },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed" },
      { status: 500 }
    );
  }
}
