import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { releaseExternalIdRow } from "@/lib/release-external-ids";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

/**
 * One-time bulk merge of duplicate releases per (platform_key, game_id).
 * Picks a winner per group, repoints all references to the winner, then deletes loser releases.
 * Run with dry_run=1 first, then dry_run=0. After that, add the unique index on releases(platform_key, game_id).
 */
export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const dryRun = url.searchParams.get("dry_run") !== "0";
    const limitGroups = Math.min(Number(url.searchParams.get("limit_groups") ?? 100), 500);

    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1) Load all releases and group by (platform_key, game_id)
    const { data: releases, error: rErr } = await supabaseAdmin
      .from("releases")
      .select("id, game_id, platform_key, display_title, cover_url, updated_at, games(id, igdb_game_id, cover_url)");

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    const rows = Array.isArray(releases) ? releases : [];
    const key = (platform: string, gameId: string) => `${platform}:${gameId}`;
    const groups = new Map<string, any[]>();

    for (const r of rows as any[]) {
      const pk = String(r?.platform_key ?? "").trim();
      const gid = String(r?.game_id ?? "").trim();
      if (!pk || !gid) continue;
      const k = key(pk, gid);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }

    const dupGroups = Array.from(groups.entries())
      .filter(([, arr]) => arr.length >= 2)
      .slice(0, limitGroups);

    if (!dupGroups.length) {
      return NextResponse.json({
        ok: true,
        dry_run: dryRun,
        duplicate_groups: 0,
        note: "No duplicate (platform_key, game_id) release groups found.",
      });
    }

    // 2) Pick winner per group (prefer IGDB, then cover, then newer updated_at)
    const plans: Array<{
      platform_key: string;
      game_id: string;
      winner: any;
      losers: any[];
      loser_ids: string[];
    }> = [];

    for (const [k, rels] of dupGroups) {
      const [platform_key, game_id] = k.split(":");
      const sorted = [...rels].sort((a, b) => {
        const score = (r: any) => {
          const igdb = r?.games?.igdb_game_id ? 1000 : 0;
          const cover = r?.cover_url || r?.games?.cover_url ? 100 : 0;
          const t = r?.updated_at ? new Date(r.updated_at).getTime() : 0;
          return igdb + cover + t / 1e12;
        };
        return score(b) - score(a);
      });
      const winner = sorted[0];
      const losers = sorted.slice(1);
      plans.push({
        platform_key,
        game_id,
        winner,
        losers,
        loser_ids: losers.map((l) => String(l.id)),
      });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        duplicate_groups: plans.length,
        planned: plans.map((p) => ({
          platform_key: p.platform_key,
          game_id: p.game_id,
          winner_id: p.winner.id,
          winner_title: p.winner.display_title,
          loser_ids: p.loser_ids,
          loser_titles: p.losers.map((l) => l.display_title),
        })),
        note: "Re-run with ?dry_run=0 to apply. Then add unique index on releases(platform_key, game_id).",
      });
    }

    // 3) Apply: for each group, repoint all references to winner, then delete losers
    let movedPortfolio = 0;
    let movedPsn = 0;
    let movedXbox = 0;
    let movedSteam = 0;
    let movedRa = 0;
    let movedExt = 0;
    let deletedReleases = 0;

    const tablesWithReleaseId = [
      "portfolio_entries",
      "psn_title_progress",
      "xbox_title_progress",
      "steam_title_progress",
      "ra_achievement_cache",
    ] as const;

    for (const plan of plans) {
      const winnerId = String(plan.winner.id);
      const loserIds = plan.loser_ids.filter(Boolean);
      if (!winnerId || !loserIds.length) continue;

      for (const table of tablesWithReleaseId) {
        const { error: uErr } = await supabaseAdmin
          .from(table)
          .update({ release_id: winnerId })
          .in("release_id", loserIds);
        if (!uErr) {
          if (table === "portfolio_entries") movedPortfolio += 1;
          else if (table === "psn_title_progress") movedPsn += 1;
          else if (table === "xbox_title_progress") movedXbox += 1;
          else if (table === "steam_title_progress") movedSteam += 1;
          else if (table === "ra_achievement_cache") movedRa += 1;
        }
      }

      // Move release_external_ids: copy loser rows to winner (upsert by source+external_id), then delete loser rows
      const { data: extRows } = await supabaseAdmin
        .from("release_external_ids")
        .select("source, external_id")
        .in("release_id", loserIds);

      if (Array.isArray(extRows) && extRows.length) {
        for (const x of extRows) {
          await supabaseAdmin.from("release_external_ids").upsert(
            releaseExternalIdRow(winnerId, x.source, x.external_id),
            { onConflict: "source,external_id" }
          );
          movedExt += 1;
        }
        await supabaseAdmin.from("release_external_ids").delete().in("release_id", loserIds);
      }

      const { error: delErr } = await supabaseAdmin.from("releases").delete().in("id", loserIds);
      if (!delErr) deletedReleases += loserIds.length;
    }

    return NextResponse.json({
      ok: true,
      dry_run: false,
      duplicate_groups: plans.length,
      moved: {
        portfolio_entries: movedPortfolio,
        psn_title_progress: movedPsn,
        xbox_title_progress: movedXbox,
        steam_title_progress: movedSteam,
        ra_achievement_cache: movedRa,
        release_external_ids: movedExt,
      },
      deleted_releases: deletedReleases,
      note: "Add unique index: CREATE UNIQUE INDEX releases_platform_game_unique ON releases(platform_key, game_id);",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "merge-release-duplicates failed" }, { status: 500 });
  }
}
