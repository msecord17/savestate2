import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { igdbFetchGameById } from "@/lib/igdb/server";

export async function POST(req: Request) {
  const supabaseUser = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const gameId = String(body?.game_id ?? "").trim();
  const igdbGameIdRaw = body?.igdb_game_id;
  const igdbGameId = igdbGameIdRaw != null ? Number(igdbGameIdRaw) : NaN;
  const alsoFillMetadata = body?.fill_cover !== false; // default true

  if (!gameId) return NextResponse.json({ error: "Missing game_id" }, { status: 400 });
  if (!Number.isFinite(igdbGameId) || igdbGameId <= 0) {
    return NextResponse.json({ error: "Missing/invalid igdb_game_id" }, { status: 400 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    igdb_game_id: igdbGameId,
    updated_at: now,
  };

  if (alsoFillMetadata) {
    const meta = await igdbFetchGameById(igdbGameId);
    if (meta) {
      if (meta.cover_url) patch.cover_url = meta.cover_url;
      if (meta.summary != null) patch.summary = meta.summary;
      if (meta.developer != null) patch.developer = meta.developer;
      if (meta.publisher != null) patch.publisher = meta.publisher;
      if (meta.first_release_year != null) patch.first_release_year = meta.first_release_year;
      if (Array.isArray(meta.genres) && meta.genres.length) patch.genres = meta.genres;
    }
  }

  const { error: uErr } = await supabaseAdmin.from("games").update(patch).eq("id", gameId);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  const coverUrl = (patch.cover_url as string) ?? null;
  if (coverUrl) {
    await supabaseAdmin.from("releases").update({ cover_url: coverUrl, updated_at: now }).eq("game_id", gameId);
  }
  return NextResponse.json({
    ok: true,
    game_id: gameId,
    igdb_game_id: igdbGameId,
    cover_url: coverUrl,
    note: coverUrl ? "IGDB id set; cover + metadata filled." : "IGDB id set; no cover returned.",
  });
}

