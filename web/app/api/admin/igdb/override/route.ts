import { NextResponse } from "next/server";
import { igdbFetchGameById, normalizeCanonicalTitle } from "@/lib/igdb/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

/**
 * POST: insert (or upsert) an IGDB override and optionally remap the affected release's game.
 * Body: { platform_key, external_id, igdb_game_id, note?, created_by?, remap?: boolean }
 * - remap: if true, find release by (platform_key, external_id), then update that release's game with the override igdb_game_id + IGDB metadata.
 */
export async function POST(req: Request) {
  try {
    const gate = await requireAdmin();
    if (!gate.ok) return gate.res;

    const body = await req.json().catch(() => ({}));
    const platform_key = body?.platform_key ?? body?.platformKey;
    const external_id = body?.external_id ?? body?.externalId;
    const igdb_game_id = body?.igdb_game_id ?? body?.igdbGameId;
    const note = body?.note ?? null;
    const created_by = body?.created_by ?? body?.createdBy ?? null;
    const remap = body?.remap === true;

    if (!platform_key || typeof platform_key !== "string" || !external_id || external_id == null) {
      return NextResponse.json(
        { error: "Missing or invalid platform_key, external_id" },
        { status: 400 }
      );
    }
    const igdbId = Number(igdb_game_id);
    if (!Number.isFinite(igdbId) || igdbId <= 0) {
      return NextResponse.json(
        { error: "Missing or invalid igdb_game_id" },
        { status: 400 }
      );
    }

    const admin = adminClient();

    const now = new Date().toISOString();
    const { data: overrideRow, error: upsertErr } = await admin
      .from("igdb_match_overrides")
      .upsert(
        {
          platform_key: String(platform_key).trim(),
          external_id: String(external_id).trim(),
          igdb_game_id: igdbId,
          note: note ?? null,
          created_by: created_by ?? null,
        },
        { onConflict: "platform_key,external_id" }
      )
      .select("id, platform_key, external_id, igdb_game_id")
      .single();

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    let remapped: { release_id: string; game_id: string } | null = null;
    if (remap) {
      const { data: mapRow } = await admin
        .from("release_external_ids")
        .select("release_id")
        .eq("source", platform_key)
        .eq("external_id", String(external_id))
        .maybeSingle();

      if (mapRow?.release_id) {
        const releaseId = String(mapRow.release_id);
        const { data: rel } = await admin
          .from("releases")
          .select("game_id, display_title")
          .eq("id", releaseId)
          .maybeSingle();

        if (rel?.game_id) {
          const gameId = String(rel.game_id);
          const meta = await igdbFetchGameById(igdbId);
          const rawTitle = (rel.display_title ?? "").trim() || "Unknown";
          const canonical = meta ? normalizeCanonicalTitle(String(meta.title || rawTitle).trim() || rawTitle) : normalizeCanonicalTitle(rawTitle);
          const patch: Record<string, unknown> = {
            igdb_game_id: igdbId,
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
          const { data: otherGame } = await admin.from("games").select("id").eq("igdb_game_id", igdbId).neq("id", gameId).maybeSingle();
          if (otherGame?.id) await admin.from("games").update({ igdb_game_id: null, updated_at: now }).eq("id", otherGame.id);
          await admin.from("games").update(patch).eq("id", gameId);
          remapped = { release_id: releaseId, game_id: gameId };
        }
      }
    }

    return NextResponse.json({
      ok: true,
      override: {
        id: overrideRow.id,
        platform_key: overrideRow.platform_key,
        external_id: overrideRow.external_id,
        igdb_game_id: overrideRow.igdb_game_id,
      },
      remapped: remapped ?? undefined,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Override failed" },
      { status: 500 }
    );
  }
}
