import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

function normalizeCover(url: string | null): string | null {
  if (!url) return null;
  const u = url.startsWith("//") ? `https:${url}` : url;
  return u.replace("t_thumb", "t_cover_big");
}

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
  const alsoFillCover = body?.fill_cover !== false; // default true

  if (!gameId) return NextResponse.json({ error: "Missing game_id" }, { status: 400 });
  if (!Number.isFinite(igdbGameId) || igdbGameId <= 0) {
    return NextResponse.json({ error: "Missing/invalid igdb_game_id" }, { status: 400 });
  }

  const clientId = process.env.IGDB_CLIENT_ID;
  const token = process.env.IGDB_ACCESS_TOKEN;
  if (!clientId || !token) {
    return NextResponse.json({ error: "Missing IGDB env vars" }, { status: 500 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch cover for this IGDB id (optional)
  let coverUrl: string | null = null;
  if (alsoFillCover) {
    const q = `
      fields id,cover.url;
      where id = (${igdbGameId});
      limit 1;
    `;
    const r = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": clientId,
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/plain",
      },
      body: q,
      cache: "no-store",
    });
    const text = await r.text();
    const j = text ? JSON.parse(text) : null;
    if (r.ok && Array.isArray(j) && j[0]?.cover?.url) {
      coverUrl = normalizeCover(String(j[0].cover.url));
    }
  }

  const patch: any = {
    igdb_game_id: igdbGameId,
    updated_at: new Date().toISOString(),
  };
  if (alsoFillCover && coverUrl) patch.cover_url = coverUrl;

  const { error: uErr } = await supabaseAdmin.from("games").update(patch).eq("id", gameId);
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    game_id: gameId,
    igdb_game_id: igdbGameId,
    cover_url: coverUrl,
    note: coverUrl ? "IGDB id set; cover filled." : "IGDB id set; no cover returned.",
  });
}

