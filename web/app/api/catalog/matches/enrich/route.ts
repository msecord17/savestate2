import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { upsertGameIgdbFirst } from "@/lib/igdb/server";

/**
 * POST: retry matching for games missing igdb_game_id (queue).
 * Uses limit=100 (or ?limit=N) to process up to N games with better normalization + platform hints from releases.
 * Picks games with igdb_game_id null; for each, gets platform_key/source from a linked release and retries upsertGameIgdbFirst.
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
    .select("id, canonical_title")
    .is("igdb_game_id", null)
    .not("canonical_title", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  const rows = Array.isArray(games) ? games : [];
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      matched: 0,
      message: "No games missing igdb_game_id in queue.",
    });
  }

  const gameIds = rows.map((g: { id: string }) => String(g.id));
  const { data: releases } = await admin
    .from("releases")
    .select("game_id, platform_key")
    .in("game_id", gameIds);

  const platformByGame = new Map<string, string>();
  for (const r of Array.isArray(releases) ? releases : []) {
    const gid = String(r?.game_id ?? "");
    if (!gid) continue;
    if (!platformByGame.has(gid)) platformByGame.set(gid, String(r?.platform_key ?? "catalog"));
  }

  let processed = 0;
  let matched = 0;
  const errors: Array<{ game_id: string; title: string; error: string }> = [];

  for (const g of rows as { id: string; canonical_title: string }[]) {
    const title = String(g?.canonical_title ?? "").trim();
    if (!title) continue;

    try {
      const platformKey = platformByGame.get(String(g.id)) ?? "catalog";
      const result = await upsertGameIgdbFirst(admin, title, {
        platform_key: platformKey,
        source: platformKey,
        useGameTitleAlias: true,
      });
      processed += 1;
      if (result.igdb_game_id != null) matched += 1;
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      errors.push({ game_id: String(g.id), title, error: err });
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    matched,
    errors: errors.slice(0, 25),
    message: `Processed ${processed} games; ${matched} matched.`,
  });
}
