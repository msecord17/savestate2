/**
 * IGDB backfill focused on games: resolves canonical game via upsertGameIgdbFirst (no direct game updates),
 * repoints releases to canonical game when the resolver returns a different row, deletes orphan game rows,
 * then propagates game cover to releases with null/unknown cover_url.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isLikelyNonGame, upsertGameIgdbFirst } from "@/lib/igdb/server";

function nowIso() {
  return new Date().toISOString();
}

export async function POST(req: Request) {
  const url = new URL(req.url);

  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const dryRun = url.searchParams.get("dry_run") === "1";

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const admin = supabaseAdmin as { from: (t: string) => any };

  // 1) Find games missing cover_url. Spine: only search when igdb_game_id IS NULL and cover_url IS NULL (resolver enforces no re-search; don't overwrite good art).
  const { data: games, error: gErr } = await supabaseAdmin
    .from("games")
    .select("id, canonical_title, igdb_game_id, cover_url")
    .is("cover_url", null)
    .not("canonical_title", "is", null)
    .limit(limit);

  if (gErr) return NextResponse.json({ ok: false, error: gErr.message }, { status: 500 });

  const rows = Array.isArray(games) ? games : [];
  if (!rows.length) {
    return NextResponse.json({ ok: true, processed: 0, updated: 0, updated_games: 0, updated_releases: 0, merged_games: 0, skipped: 0, note: "No games missing cover_url." });
  }

  let processed = 0;
  let mergedGames = 0;
  const canonicalGameIds = new Set<string>();
  const debug: Array<{ game_id: string; title: string; canonical_game_id: string; merged?: boolean }> = [];

  // 2) For each missing-cover game, resolve canonical game via upsertGameIgdbFirst. Skip non-games (ignore list).
  for (const g of rows) {
    processed += 1;

    const raw = String(g?.canonical_title ?? "").trim();
    if (!raw) continue;
    if (isLikelyNonGame(raw)) continue;

    let result: { game_id: string; igdb_game_id: number | null };
    try {
      result = await upsertGameIgdbFirst(admin, raw, { platform: "backfill" });
    } catch (e: any) {
      console.warn("[backfill-covers] upsertGameIgdbFirst failed", { id: g.id, title: raw, error: e?.message });
      continue;
    }

    const canonicalId = String(result?.game_id ?? "").trim();
    if (!canonicalId) continue;

    canonicalGameIds.add(canonicalId);

    if (canonicalId !== String(g.id)) {
      // Resolver returned a different row (canonical already exists) — re-point releases to it and delete this row
      if (!dryRun) {
        const { error: mvErr } = await supabaseAdmin
          .from("releases")
          .update({ game_id: canonicalId, updated_at: nowIso() })
          .eq("game_id", g.id);

        if (mvErr) {
          console.warn("[backfill-covers] repoint releases failed", { from_game_id: g.id, to_game_id: canonicalId, error: mvErr.message });
        } else {
          const { error: delErr } = await supabaseAdmin.from("games").delete().eq("id", g.id);
          if (delErr) {
            console.warn("[backfill-covers] delete orphan game failed", { id: g.id, error: delErr.message });
          } else {
            mergedGames += 1;
          }
        }
      } else {
        mergedGames += 1;
      }
      debug.push({ game_id: g.id, title: raw, canonical_game_id: canonicalId, merged: true });
    } else {
      debug.push({ game_id: g.id, title: raw, canonical_game_id: canonicalId });
    }
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      processed,
      would_merge_games: mergedGames,
      canonical_game_ids: Array.from(canonicalGameIds).length,
      sample: debug.slice(0, 10),
    });
  }

  // 3) Propagate game cover to releases (game_id in canonical set) with null/unknown cover_url
  let updatedReleases = 0;
  if (canonicalGameIds.size > 0) {
    const gameIdsArray = Array.from(canonicalGameIds);

    const { data: gamesWithCovers, error: gErr2 } = await supabaseAdmin
      .from("games")
      .select("id, cover_url")
      .in("id", gameIdsArray)
      .not("cover_url", "is", null);

    if (!gErr2 && Array.isArray(gamesWithCovers)) {
      const { data: releases, error: rErr } = await supabaseAdmin
        .from("releases")
        .select("id, game_id, cover_url")
        .in("game_id", gameIdsArray)
        .or("cover_url.is.null,cover_url.ilike.%unknown.png%");

      if (!rErr && Array.isArray(releases)) {
        const coverByGameId = new Map<string, string>();
        for (const gw of gamesWithCovers as { id: string; cover_url: string }[]) {
          if (gw?.cover_url) coverByGameId.set(String(gw.id), gw.cover_url);
        }

        const releasesByGame = new Map<string, string[]>();
        for (const r of releases as { id: string; game_id: string }[]) {
          const gid = String(r?.game_id ?? "");
          if (coverByGameId.has(gid)) {
            if (!releasesByGame.has(gid)) releasesByGame.set(gid, []);
            releasesByGame.get(gid)!.push(String(r.id));
          }
        }

        for (const [gameId, releaseIds] of releasesByGame.entries()) {
          const coverUrl = coverByGameId.get(gameId);
          if (!coverUrl || !releaseIds.length) continue;

          const { error: updateErr } = await supabaseAdmin
            .from("releases")
            .update({ cover_url: coverUrl, updated_at: nowIso() })
            .in("id", releaseIds);

          if (!updateErr) updatedReleases += releaseIds.length;
          else console.warn("[backfill-covers] release cover update failed", { game_id: gameId, release_ids: releaseIds, error: updateErr.message });
        }
      }
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    updated: updatedReleases,
    updated_games: canonicalGameIds.size,
    updated_releases: updatedReleases,
    merged_games: mergedGames,
    skipped: rows.length - processed,
    sample: debug.slice(0, 10),
  });
}
