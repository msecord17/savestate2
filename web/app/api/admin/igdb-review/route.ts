import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

/**
 * GET: list games where match_status = 'needs_review' (for review queue UI).
 */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const admin = adminClient();

  const { data, error } = await admin
    .from("games")
    .select("id, canonical_title, match_status, match_confidence, match_query, match_debug, matched_at")
    .eq("match_status", "needs_review")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, games: data ?? [] });
}

/**
 * POST: { game_id, igdb_game_id } — set igdb_game_id and match_status = 'verified' on the game.
 */
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const admin = adminClient();

  let body: { game_id?: string; igdb_game_id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const gameId = body.game_id;
  const rawIgdb = body.igdb_game_id;

  if (!gameId) {
    return NextResponse.json(
      { error: "Missing or invalid game_id / igdb_game_id" },
      { status: 400 }
    );
  }

  if (rawIgdb == null) {
    return NextResponse.json(
      { error: "Missing or invalid game_id / igdb_game_id" },
      { status: 400 }
    );
  }

  const igdbGameId = Number(rawIgdb);

  if (!Number.isFinite(igdbGameId) || igdbGameId <= 0) {
    return NextResponse.json(
      { error: "Missing or invalid game_id / igdb_game_id" },
      { status: 400 }
    );
  }

  const { data: game, error: fetchErr } = await admin
    .from("games")
    .select("id, canonical_title")
    .eq("id", gameId)
    .single();

  if (fetchErr || !game) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }

  const { error: updateErr } = await admin
    .from("games")
    .update({
      igdb_game_id: igdbGameId,
      match_status: "verified",
      matched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", gameId);

  if (updateErr) {
    if ((updateErr as { code?: string })?.code === "23505") {
      return NextResponse.json(
        { error: "Another game already has this igdb_game_id" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, game_id: gameId, igdb_game_id: igdbGameId });
}
