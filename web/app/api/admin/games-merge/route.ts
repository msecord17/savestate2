import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST: merge games that share the same igdb_game_id.
 * Body: { igdb_game_id: number } — find all games with this igdb_game_id, pick a winner (e.g. the one with most metadata), repoint releases.game_id to winner, delete losers.
 */
export async function POST(req: Request) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let body: { igdb_game_id?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawIgdb = body.igdb_game_id;

  if (rawIgdb == null) {
    return NextResponse.json(
      { error: "Missing or invalid igdb_game_id" },
      { status: 400 }
    );
  }

  const igdbGameId = Number(rawIgdb);

  if (!Number.isFinite(igdbGameId)) {
    return NextResponse.json(
      { error: "Missing or invalid igdb_game_id" },
      { status: 400 }
    );
  }

  const { data: games, error: listErr } = await admin
    .from("games")
    .select("id, canonical_title, cover_url, summary, first_release_year")
    .eq("igdb_game_id", igdbGameId);

  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });
  const rows = (games ?? []) as Array<{
    id: string;
    canonical_title: string | null;
    cover_url: string | null;
    summary: string | null;
    first_release_year: number | null;
  }>;

  if (rows.length <= 1) {
    return NextResponse.json({
      ok: true,
      merged: 0,
      message: rows.length === 0 ? "No games found with this igdb_game_id" : "Only one game, nothing to merge",
    });
  }

  // Winner: prefer row with cover + summary + first_release_year; else first by id
  const score = (g: (typeof rows)[0]) =>
    (g.cover_url ? 4 : 0) + (g.summary ? 2 : 0) + (g.first_release_year != null ? 1 : 0);
  rows.sort((a, b) => score(b) - score(a) || String(a.id).localeCompare(String(b.id)));
  const winnerId = rows[0]!.id;
  const loserIds = rows.slice(1).map((g) => g.id);

  for (const loserId of loserIds) {
    const { error: repointErr } = await admin
      .from("releases")
      .update({ game_id: winnerId, updated_at: new Date().toISOString() })
      .eq("game_id", loserId);
    if (repointErr) {
      return NextResponse.json(
        { error: `Failed to repoint releases from ${loserId}: ${repointErr.message}` },
        { status: 500 }
      );
    }
  }

  const { error: delErr } = await admin.from("games").delete().in("id", loserIds);
  if (delErr) {
    return NextResponse.json(
      { error: `Failed to delete merged games: ${delErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    winner_id: winnerId,
    merged_count: loserIds.length,
    deleted_ids: loserIds,
  });
}
