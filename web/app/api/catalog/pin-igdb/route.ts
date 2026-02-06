import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { igdbFetchGameById } from "@/lib/igdb/server";

function nowIso() {
  return new Date().toISOString();
}

/**
 * Manual "pin IGDB" for weird SKUs: set games.igdb_game_id, fetch IGDB by id, update cover + metadata, propagate cover to releases.
 * POST body: { game_id, igdb_game_id }
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const gameId = String(body?.game_id ?? "").trim();
  const igdbGameIdRaw = body?.igdb_game_id;
  const igdbGameId = igdbGameIdRaw != null ? Number(igdbGameIdRaw) : NaN;

  if (!gameId) return NextResponse.json({ ok: false, error: "Missing game_id" }, { status: 400 });
  if (!Number.isFinite(igdbGameId) || igdbGameId <= 0) {
    return NextResponse.json({ ok: false, error: "Missing/invalid igdb_game_id" }, { status: 400 });
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const hit = await igdbFetchGameById(igdbGameId);
  if (!hit) {
    return NextResponse.json({ ok: false, error: "IGDB game not found for id: " + igdbGameId }, { status: 404 });
  }

  const patch: Record<string, unknown> = {
    igdb_game_id: igdbGameId,
    canonical_title: hit.title.trim() || undefined,
    updated_at: nowIso(),
  };
  if (hit.summary != null) patch.summary = hit.summary;
  if (hit.developer != null) patch.developer = hit.developer;
  if (hit.publisher != null) patch.publisher = hit.publisher;
  if (hit.first_release_year != null) patch.first_release_year = hit.first_release_year;
  if (Array.isArray(hit.genres) && hit.genres.length) patch.genres = hit.genres;
  if (hit.cover_url) patch.cover_url = hit.cover_url;

  const { error: updateErr } = await admin.from("games").update(patch).eq("id", gameId);
  if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

  let releasesUpdated = 0;
  if (hit.cover_url) {
    const { data: releases } = await admin
      .from("releases")
      .select("id, cover_url")
      .eq("game_id", gameId);

    const rows = (releases ?? []) as { id: string; cover_url: string | null }[];
    for (const r of rows) {
      const current = String(r?.cover_url ?? "").trim().toLowerCase();
      const isBad = !current || current.includes("unknown") || current.includes("placeholder");
      if (isBad) {
        const { error: relErr } = await admin
          .from("releases")
          .update({ cover_url: hit.cover_url, updated_at: nowIso() })
          .eq("id", r.id);
        if (!relErr) releasesUpdated += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    game_id: gameId,
    igdb_game_id: igdbGameId,
    canonical_title: hit.title,
    cover_url: hit.cover_url ?? null,
    releases_updated: releasesUpdated,
  });
}
