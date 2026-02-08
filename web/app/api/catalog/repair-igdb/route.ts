import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { upsertGameIgdbFirst, isLikelyNonGame } from "@/lib/igdb/server";

/**
 * POST: process N games missing igdb_game_id or cover_url.
 * Idempotent: only writes games.igdb_game_id when match score >= 0.84 (accepted).
 * Below threshold we do NOT set igdb_game_id; game_match_audit + igdb_match_review_queue get the attempt.
 * Query params: limit (default 100, max 500).
 */
export async function POST(req: Request) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 500);

  const { data: games, error: gErr } = await admin
    .from("games")
    .select("id, canonical_title, igdb_game_id, cover_url")
    .or("igdb_game_id.is.null,cover_url.is.null")
    .not("canonical_title", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  const rows = Array.isArray(games) ? games : [];
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      accepted: 0,
      message: "No games missing igdb_game_id or cover_url.",
    });
  }

  const gameIds = rows.map((g: { id: string }) => String(g.id));
  const { data: releases } = await admin
    .from("releases")
    .select("game_id, platform_key, id")
    .in("game_id", gameIds);

  const platformByGame = new Map<string, { platform_key: string; release_id: string }>();
  for (const r of Array.isArray(releases) ? releases : []) {
    const gid = String(r?.game_id ?? "");
    if (!gid) continue;
    if (!platformByGame.has(gid))
      platformByGame.set(gid, { platform_key: String(r?.platform_key ?? "catalog"), release_id: String(r?.id ?? "") });
  }

  let processed = 0;
  let accepted = 0;
  const errors: Array<{ game_id: string; title: string; error: string }> = [];

  for (const g of rows as { id: string; canonical_title: string; igdb_game_id: number | null }[]) {
    const title = String(g?.canonical_title ?? "").trim();
    if (!title) continue;
    if (isLikelyNonGame(title)) continue;

    try {
      const { platform_key, release_id } = platformByGame.get(String(g.id)) ?? {
        platform_key: "catalog",
        release_id: "",
      };
      const result = await upsertGameIgdbFirst(admin, title, {
        platform_key,
        source: platform_key,
        useGameTitleAlias: true,
        release_id: release_id || undefined,
      });
      processed += 1;
      if (result.igdb_game_id != null) accepted += 1;
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      errors.push({ game_id: String(g.id), title, error: err });
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    accepted,
    errors: errors.slice(0, 25),
    message: `Processed ${processed} games; ${accepted} accepted (score >= 0.84).`,
  });
}
