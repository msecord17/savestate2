import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { upsertGameIgdbFirst } from "@/lib/igdb/server";

function nowIso() {
  return new Date().toISOString();
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 250);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const cursor = url.searchParams.get("cursor"); // release_id cursor

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Pull "bad" releases, stable ordering for cursor pagination
  let q = admin
    .from("releases")
    .select("id, display_title, platform_key, game_id, cover_url, games(id, canonical_title, igdb_game_id, cover_url)")
    .not("display_title", "is", null)
    .order("id", { ascending: true })
    .limit(limit + 1);

  if (cursor) q = q.gt("id", cursor);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rows = (data ?? []) as any[];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  let processed = 0;
  let updatedGames = 0;
  let updatedReleases = 0;
  let skipped = 0;
  const errors: any[] = [];

  for (const r of page) {
    processed += 1;

    const game = Array.isArray(r.games) ? r.games[0] : r.games;
    const title = String(game?.canonical_title || r.display_title || "").trim();
    if (!title) {
      skipped += 1;
      continue;
    }

    // only attempt repair if missing igdb or missing cover
    const missingIgdb = !game?.igdb_game_id;
    const missingCover = !game?.cover_url && (!r.cover_url || String(r.cover_url).includes("unknown.png"));

    if (!missingIgdb && !missingCover) {
      skipped += 1;
      continue;
    }

    try {
      if (!dryRun) {
        const opts = r.platform_key ? { platform_key: String(r.platform_key) } : undefined;
        const res = await upsertGameIgdbFirst(admin, title, opts);

        // If release has no cover but game now does, propagate
        if (res?.game_id && game?.id && res.game_id === game.id) {
          const { data: gRow } = await admin.from("games").select("cover_url").eq("id", game.id).single();
          const gCover = (gRow as any)?.cover_url;

          if (gCover && (!r.cover_url || String(r.cover_url).includes("unknown.png"))) {
            const { error: upErr } = await admin
              .from("releases")
              .update({ cover_url: gCover, updated_at: nowIso() })
              .eq("id", r.id);
            if (!upErr) updatedReleases += 1;
          }
        }
      }

      updatedGames += 1;
    } catch (e: any) {
      errors.push({ release_id: r.id, title, error: e?.message || "unknown error" });
    }
  }

  const nextCursor = hasMore ? page[page.length - 1]?.id : null;

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    processed,
    updated_games: updatedGames,
    updated_releases: updatedReleases,
    skipped,
    errors: errors.slice(0, 20),
    next_cursor: nextCursor,
    has_more: hasMore,
  });
}
