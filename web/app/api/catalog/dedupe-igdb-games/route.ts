import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

function nowIso() {
  return new Date().toISOString();
}

function isBadCover(url: string | null | undefined) {
  if (!url) return true;
  const u = String(url).toLowerCase();
  return u.includes("unknown.png") || u.includes("placeholder");
}

function scoreGame(g: any, releaseCount: number) {
  const hasCover = !isBadCover(g?.cover_url) ? 50 : 0;
  const hasSummary = g?.summary ? 10 : 0;
  const hasDev = g?.developer ? 10 : 0;
  const hasPub = g?.publisher ? 5 : 0;
  const hasYear = g?.first_release_year ? 3 : 0;
  const hasGenres = Array.isArray(g?.genres) && g.genres.length ? 3 : 0;
  const updated = g?.updated_at ? new Date(g.updated_at).getTime() : 0;
  return releaseCount * 1000 + hasCover + hasSummary + hasDev + hasPub + hasYear + hasGenres + updated / 1e12;
}

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") !== "0"; // default true
    const limitIds = Math.min(Number(url.searchParams.get("limit_ids") || 50), 500);

    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1) Find candidate IGDB ids that have >1 game row.
    // Supabase doesn't expose GROUP BY nicely; we do a bounded scan and group in-memory.
    const { data: games, error: gErr } = await supabaseAdmin
      .from("games")
      .select("id, igdb_game_id, canonical_title, cover_url, summary, genres, developer, publisher, first_release_year, updated_at")
      .not("igdb_game_id", "is", null)
      .limit(5000);

    if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

    const rows = Array.isArray(games) ? games : [];
    const byIgdb = new Map<number, any[]>();
    for (const g of rows as any[]) {
      const id = g?.igdb_game_id != null ? Number(g.igdb_game_id) : NaN;
      if (!Number.isFinite(id) || id <= 0) continue;
      if (!byIgdb.has(id)) byIgdb.set(id, []);
      byIgdb.get(id)!.push(g);
    }

    const dupIgdbIds = Array.from(byIgdb.entries())
      .filter(([_, arr]) => (arr?.length ?? 0) >= 2)
      .slice(0, limitIds)
      .map(([igdbId]) => igdbId);

    if (!dupIgdbIds.length) {
      return NextResponse.json({ ok: true, dry_run: dryRun, deduped_ids: 0, note: "No duplicate games.igdb_game_id found in this scan." });
    }

    // 2) Load releases for these games so we can pick a winner and repoint.
    const gameIds = dupIgdbIds.flatMap((igdbId) => (byIgdb.get(igdbId) ?? []).map((g: any) => String(g.id)));

    const { data: rels, error: rErr } = await supabaseAdmin
      .from("releases")
      .select("id, game_id, platform_key")
      .in("game_id", gameIds);

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    const releases = Array.isArray(rels) ? rels : [];
    const releaseCountByGame = new Map<string, number>();
    for (const r of releases as any[]) {
      const gid = String(r?.game_id ?? "");
      if (!gid) continue;
      releaseCountByGame.set(gid, (releaseCountByGame.get(gid) ?? 0) + 1);
    }

    const plans: any[] = [];

    for (const igdbId of dupIgdbIds) {
      const gamesForId = byIgdb.get(igdbId) ?? [];
      if (gamesForId.length < 2) continue;

      const ranked = [...gamesForId]
        .map((g: any) => {
          const gid = String(g.id);
          const relCount = releaseCountByGame.get(gid) ?? 0;
          return { g, gid, relCount, score: scoreGame(g, relCount) };
        })
        .sort((a, b) => b.score - a.score);

      const winner = ranked[0];
      const losers = ranked.slice(1);

      // Only bother if at least one loser has releases to move OR we want to delete empty dupes.
      const loserIds = losers.map((x) => x.gid);
      plans.push({
        igdb_game_id: igdbId,
        winner: { game_id: winner.gid, canonical_title: winner.g?.canonical_title ?? null, release_count: winner.relCount },
        losers: losers.map((x) => ({ game_id: x.gid, canonical_title: x.g?.canonical_title ?? null, release_count: x.relCount })),
        move_release_count: loserIds.reduce((n, gid) => n + (releaseCountByGame.get(gid) ?? 0), 0),
      });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        duplicate_igdb_ids: dupIgdbIds.length,
        planned: plans,
        note: "Dry run. Re-run with ?dry_run=0 to apply (repoint releases then delete loser games).",
      });
    }

    let movedReleases = 0;
    let deletedGames = 0;
    let failed = 0;

    for (const plan of plans) {
      const winnerGameId = String(plan?.winner?.game_id ?? "");
      const losers: any[] = Array.isArray(plan?.losers) ? plan.losers : [];
      const loserIds = losers.map((x) => String(x?.game_id ?? "")).filter(Boolean);
      if (!winnerGameId || loserIds.length === 0) continue;

      // A) Move releases
      const { error: mvErr } = await supabaseAdmin
        .from("releases")
        .update({ game_id: winnerGameId, updated_at: nowIso() })
        .in("game_id", loserIds);

      if (mvErr) {
        failed += 1;
        continue;
      }

      movedReleases += Number(plan?.move_release_count || 0);

      // B) Delete loser games (safe now that releases moved)
      const { error: delErr } = await supabaseAdmin.from("games").delete().in("id", loserIds);
      if (delErr) {
        failed += 1;
        continue;
      }

      deletedGames += loserIds.length;
    }

    return NextResponse.json({
      ok: true,
      dry_run: false,
      duplicate_igdb_ids: dupIgdbIds.length,
      moved_releases: movedReleases,
      deleted_games: deletedGames,
      failed_groups: failed,
      note: "Deduped games by igdb_game_id. You can now add the partial unique index safely.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "dedupe-igdb-games failed" }, { status: 500 });
  }
}

