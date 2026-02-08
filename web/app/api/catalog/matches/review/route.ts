import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { igdbFetchGameById } from "@/lib/igdb/server";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * GET: list proposed matches (status='proposed') sorted by confidence desc for review UI.
 * Admin-only: requires auth.
 */
export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = adminClient();
  const { data, error } = await admin
    .from("game_matches")
    .select(`
      id,
      game_id,
      release_id,
      source,
      source_title,
      source_external_id,
      igdb_game_id,
      status,
      confidence,
      match_debug,
      created_at,
      games ( id, canonical_title, cover_url, igdb_game_id )
    `)
    .eq("status", "proposed")
    .order("confidence", { ascending: false, nullsFirst: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, matches: data ?? [] });
}

/**
 * POST: accept / reject / search_again for a proposed match.
 * Body: { match_id: string, action: 'accept' | 'reject' | 'search_again' }
 * Admin-only: requires auth.
 */
export async function POST(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { match_id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const matchId = body.match_id?.trim();
  const action = (body.action ?? "").toLowerCase();
  if (!matchId || !["accept", "reject", "search_again"].includes(action)) {
    return NextResponse.json(
      { error: "Missing or invalid match_id / action (accept | reject | search_again)" },
      { status: 400 }
    );
  }

  const admin = adminClient();
  const now = new Date().toISOString();

  const { data: match, error: fetchErr } = await admin
    .from("game_matches")
    .select("id, game_id, igdb_game_id, status, confidence")
    .eq("id", matchId)
    .single();

  if (fetchErr || !match || match.status !== "proposed") {
    return NextResponse.json({ error: "Match not found or not proposed" }, { status: 404 });
  }

  const gameId = String(match.game_id);
  const igdbGameId = Number(match.igdb_game_id);

  if (action === "reject") {
    const { error: updErr } = await admin
      .from("game_matches")
      .update({ status: "rejected", resolved_at: now, resolved_by: "manual", updated_at: now })
      .eq("id", matchId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, match_id: matchId, action: "rejected" });
  }

  if (action === "search_again") {
    const { error: updErr } = await admin
      .from("game_matches")
      .update({ status: "rejected", resolved_at: now, resolved_by: "search_again", updated_at: now })
      .eq("id", matchId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      match_id: matchId,
      action: "search_again",
      note: "Match rejected; use /api/catalog/matches/enrich to retry matching for this game.",
    });
  }

  if (action === "accept") {
    const hit = await igdbFetchGameById(igdbGameId);
    if (!hit) return NextResponse.json({ error: "IGDB game not found" }, { status: 404 });

    await admin.from("game_matches").update({ status: "rejected", updated_at: now }).eq("game_id", gameId).eq("status", "accepted");
    const { error: acceptErr } = await admin
      .from("game_matches")
      .update({ status: "accepted", resolved_at: now, resolved_by: "manual", updated_at: now })
      .eq("id", matchId);
    if (acceptErr) return NextResponse.json({ error: acceptErr.message }, { status: 500 });

    const { data: otherGame } = await admin.from("games").select("id").eq("igdb_game_id", igdbGameId).neq("id", gameId).maybeSingle();
    if (otherGame?.id) {
      await admin.from("games").update({ igdb_game_id: null, updated_at: now }).eq("id", otherGame.id);
    }

    const patch: Record<string, unknown> = {
      igdb_game_id: igdbGameId,
      canonical_title: (hit.title || "").trim() || undefined,
      match_status: "verified",
      matched_at: now,
      updated_at: now,
    };
    if (hit.summary != null) patch.summary = hit.summary;
    if (hit.developer != null) patch.developer = hit.developer;
    if (hit.publisher != null) patch.publisher = hit.publisher;
    if (hit.first_release_year != null) patch.first_release_year = hit.first_release_year;
    if (Array.isArray(hit.genres) && hit.genres.length) patch.genres = hit.genres;
    if (hit.cover_url) patch.cover_url = hit.cover_url;
    if (hit.category != null) patch.igdb_category = hit.category;

    const { data: gameRow } = await admin.from("games").select("cover_url").eq("id", gameId).single();
    const overwriteCover = !gameRow?.cover_url || String(gameRow.cover_url).toLowerCase().includes("placeholder") || String(gameRow.cover_url).toLowerCase().includes("unknown");
    if (!overwriteCover && patch.cover_url) delete patch.cover_url;

    const { error: gameErr } = await admin.from("games").update(patch).eq("id", gameId);
    if (gameErr) {
      if ((gameErr as { code?: string })?.code === "23505") {
        return NextResponse.json({ error: "Another game already has this igdb_game_id" }, { status: 409 });
      }
      return NextResponse.json({ error: gameErr.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      match_id: matchId,
      action: "accepted",
      game_id: gameId,
      igdb_game_id: igdbGameId,
    });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
