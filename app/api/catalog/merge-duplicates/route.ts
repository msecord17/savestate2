import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

function normTitle(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/™|®|©/g, "")
    .replace(/[:\-–—]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(edition|deluxe|ultimate|definitive|remastered|complete)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBadCover(url: string | null) {
  if (!url) return true;
  const u = url.toLowerCase();
  return u.includes("unknown.png") || u.includes("placeholder");
}

// choose best release to keep
function pickWinner(rels: any[]) {
  // scoring: prefer IGDB, then good cover, then newer updated_at
  const score = (r: any) => {
    const igdb = r.games?.igdb_game_id ? 1000 : 0;
    const goodCover = (!isBadCover(r.cover_url) || !isBadCover(r.games?.cover_url ?? null)) ? 100 : 0;
    const updated = r.updated_at ? new Date(r.updated_at).getTime() : 0;
    return igdb + goodCover + updated / 1e12; // tiny tie-breaker
  };
  return [...rels].sort((a, b) => score(b) - score(a))[0];
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const limitGroups = Math.min(Number(url.searchParams.get("limit_groups") ?? 25), 100);

  const supabaseUser = await supabaseRouteClient();
  const { data: userRes } = await supabaseUser.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = userRes.user;

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // load user library releases + games
  const { data: entries, error } = await supabaseAdmin
    .from("portfolio_entries")
    .select(
      `
      release_id,
      releases:release_id (
        id,
        display_title,
        platform_key,
        cover_url,
        game_id,
        updated_at,
        games (
          id,
          canonical_title,
          igdb_game_id,
          cover_url
        )
      )
    `
    )
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const rels = (entries || []).map((e: any) => e?.releases).filter(Boolean);

  // group duplicates
  const groups = new Map<string, any[]>();
  for (const r of rels) {
    const title = r.games?.canonical_title || r.display_title || "";
    const key = normTitle(title);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const dupGroups = [...groups.entries()]
    .filter(([_, arr]) => arr.length >= 2)
    .slice(0, limitGroups);

  let mergedGroups = 0;
  let movedPortfolioRows = 0;
  let movedPsnRows = 0;
  let movedXboxRows = 0;
  let movedSteamRows = 0;
  let movedRaCacheRows = 0;

  const actions: any[] = [];

  for (const [key, arr] of dupGroups) {
    const winner = pickWinner(arr);
    const losers = arr.filter((r) => r.id !== winner.id);

    if (!losers.length) continue;

    mergedGroups += 1;

    actions.push({
      key,
      winner: { release_id: winner.id, title: winner.display_title, igdb: winner.games?.igdb_game_id ?? null },
      losers: losers.map((l) => ({ release_id: l.id, title: l.display_title })),
    });

    if (dryRun) continue;

    for (const loser of losers) {
      // 1) move portfolio rows for this user
      const pQ = supabaseAdmin
        .from("portfolio_entries")
        .update({ release_id: winner.id })
        .eq("user_id", user.id)
        .eq("release_id", loser.id);

      const { error: pErr, count: pCount } = await (pQ as any).select("*", { count: "exact" }).limit(0);

      if (!pErr && pCount) movedPortfolioRows += pCount;

      // 2) move signal rows (safe even if table has no rows)
      const move = async (table: string) => {
        const q = supabaseAdmin
          .from(table)
          .update({ release_id: winner.id })
          .eq("user_id", user.id)
          .eq("release_id", loser.id);

        const { error: e2, count } = await (q as any).select("*", { count: "exact" }).limit(0);

        return { error: e2?.message ?? null, count: count ?? 0 };
      };

      const a = await move("psn_title_progress");  movedPsnRows += a.count;
      const b = await move("xbox_title_progress"); movedXboxRows += b.count;
      const c = await move("steam_title_progress"); movedSteamRows += c.count;
      const d = await move("ra_achievement_cache"); movedRaCacheRows += d.count;

      // 3) move external ids from loser -> winner (best-effort)
      const { data: loserExt } = await supabaseAdmin
        .from("release_external_ids")
        .select("source, external_id")
        .eq("release_id", loser.id);

      if (Array.isArray(loserExt) && loserExt.length) {
        for (const x of loserExt) {
          await supabaseAdmin
            .from("release_external_ids")
            .upsert(
              { release_id: winner.id, source: x.source, external_id: x.external_id },
              { onConflict: "release_id,source" }
            );
        }
      }

      // 4) delete loser release (optional but recommended once moved)
      await supabaseAdmin.from("releases").delete().eq("id", loser.id);
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    scanned_groups: dupGroups.length,
    merged_groups: mergedGroups,
    moved: {
      portfolio_entries: movedPortfolioRows,
      psn_title_progress: movedPsnRows,
      xbox_title_progress: movedXboxRows,
      steam_title_progress: movedSteamRows,
      ra_achievement_cache: movedRaCacheRows,
    },
    sample_actions: actions.slice(0, 10),
    note: "Run multiple times if you have tons of dupes. Increase limit_groups if needed.",
  });
}
