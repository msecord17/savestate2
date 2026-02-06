import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { releaseExternalIdRow } from "@/lib/release-external-ids";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { upsertGameIgdbFirst } from "@/lib/igdb/server";

/**
 * PSN release canonicalizer repair job.
 *
 * For each release_external_ids where source='psn', the referenced release_id is the
 * "platform identity" (truth anchor). This job:
 * 1) Ensures that release has game_id (via IGDB-first on title) and platform_key='psn'.
 * 2) Finds any other releases with same (platform_key='psn', game_id).
 * 3) Moves portfolio + signal rows to the canonical release, merges release_external_ids, deletes duplicates.
 *
 * Run with dry_run=1 first, then dry_run=0.
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

    // 1) Load all PSN external ID rows → canonical release_ids
    const { data: psnRows, error: extErr } = await supabaseAdmin
      .from("release_external_ids")
      .select("release_id, external_id")
      .eq("source", "psn");

    if (extErr) return NextResponse.json({ error: extErr.message }, { status: 500 });

    const psnMappings = Array.isArray(psnRows) ? psnRows : [];
    if (!psnMappings.length) {
      return NextResponse.json({
        ok: true,
        dry_run: dryRun,
        psn_mappings: 0,
        note: "No release_external_ids(source='psn') rows found.",
      });
    }

    // Count PSN refs per release (for picking winner)
    const psnRefCount = new Map<string, number>();
    const canonicalReleaseIds = new Set<string>();
    for (const row of psnMappings as { release_id: string; external_id: string }[]) {
      const rid = String(row?.release_id ?? "").trim();
      if (!rid) continue;
      canonicalReleaseIds.add(rid);
      psnRefCount.set(rid, (psnRefCount.get(rid) ?? 0) + 1);
    }

    const uniqueCanonicalIds = [...canonicalReleaseIds];

    // 2) Fetch those releases
    const { data: releases, error: rErr } = await supabaseAdmin
      .from("releases")
      .select("id, game_id, platform_key, display_title, updated_at")
      .in("id", uniqueCanonicalIds);

    if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

    const releaseRows = (Array.isArray(releases) ? releases : []) as Array<{
      id: string;
      game_id: string | null;
      platform_key: string | null;
      display_title: string | null;
      updated_at: string | null;
    }>;

    // 3) Ensure each has game_id and platform_key='psn' (skip in dry run to avoid side effects)
    let fixedGameId = 0;
    let fixedPlatformKey = 0;
    for (const rel of releaseRows) {
      if (!rel?.id) continue;
      const updates: { game_id?: string; platform_key?: string } = {};
      if (rel.platform_key !== "psn") {
        updates.platform_key = "psn";
        fixedPlatformKey += 1;
      }
      if (!rel.game_id && rel.display_title && !dryRun) {
        try {
          const { game_id } = await upsertGameIgdbFirst(supabaseAdmin, rel.display_title, { platform: "psn" });
          updates.game_id = game_id;
          fixedGameId += 1;
        } catch (e: any) {
          console.warn(`psn-canonicalizer: IGDB resolve failed for release ${rel.id}: ${e?.message}`);
        }
      }
      if (Object.keys(updates).length && !dryRun) {
        await supabaseAdmin.from("releases").update(updates).eq("id", rel.id);
      }
      if (updates.game_id) (rel as any).game_id = updates.game_id;
      if (updates.platform_key) (rel as any).platform_key = "psn";
    }

    // 4) Group by (platform_key='psn', game_id); only consider releases that now have game_id
    const gameIdToCanonicalReleaseIds = new Map<string, string[]>();
    for (const r of releaseRows) {
      const gid = String(r?.game_id ?? "").trim();
      const pk = String(r?.platform_key ?? "").trim();
      if (pk !== "psn" || !gid) continue;
      if (!gameIdToCanonicalReleaseIds.has(gid)) gameIdToCanonicalReleaseIds.set(gid, []);
      gameIdToCanonicalReleaseIds.get(gid)!.push(r.id);
    }

    // For each game_id, load ALL releases with (platform_key='psn', game_id) to find losers
    const plans: Array<{ game_id: string; winner_id: string; loser_ids: string[] }> = [];
    const gameIds = [...gameIdToCanonicalReleaseIds.keys()].slice(0, limitGroups);

    for (const gameId of gameIds) {
      const { data: allReleasesForGame, error: allErr } = await supabaseAdmin
        .from("releases")
        .select("id")
        .eq("platform_key", "psn")
        .eq("game_id", gameId);

      if (allErr) continue;
      const allIds = (Array.isArray(allReleasesForGame) ? allReleasesForGame : []).map((x: any) => String(x?.id ?? ""));
      if (allIds.length < 2) continue;

      const canonicalCandidates = gameIdToCanonicalReleaseIds.get(gameId) ?? [];
      // Winner = canonical candidate with most PSN refs, then smallest id
      const winnerId =
        canonicalCandidates.length > 0
          ? [...canonicalCandidates].sort((a, b) => {
              const refA = psnRefCount.get(a) ?? 0;
              const refB = psnRefCount.get(b) ?? 0;
              if (refB !== refA) return refB - refA;
              return a.localeCompare(b);
            })[0]
          : allIds[0];

      const loserIds = allIds.filter((id) => id !== winnerId);
      if (!loserIds.length) continue;

      plans.push({ game_id: gameId, winner_id: winnerId, loser_ids: loserIds });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        psn_mappings: psnMappings.length,
        canonical_releases: uniqueCanonicalIds.length,
        fixed_game_id: fixedGameId,
        fixed_platform_key: fixedPlatformKey,
        merge_plans: plans.length,
        planned: plans.map((p) => ({
          game_id: p.game_id,
          winner_id: p.winner_id,
          loser_ids: p.loser_ids,
        })),
        note: "Re-run with ?dry_run=0 to apply. Game_id/platform_key are not updated in dry run, so merge_plans may be incomplete until applied.",
      });
    }

    // 5) Apply merges (same tables as merge-release-duplicates)
    const tablesWithReleaseId = [
      "portfolio_entries",
      "psn_title_progress",
      "xbox_title_progress",
      "steam_title_progress",
      "ra_achievement_cache",
    ] as const;

    let movedPortfolio = 0;
    let movedPsn = 0;
    let movedXbox = 0;
    let movedSteam = 0;
    let movedRa = 0;
    let movedExt = 0;
    let deletedReleases = 0;

    for (const plan of plans) {
      const winnerId = plan.winner_id;
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

      const { data: extRows } = await supabaseAdmin
        .from("release_external_ids")
        .select("source, external_id")
        .in("release_id", loserIds);

      if (Array.isArray(extRows) && extRows.length) {
        for (const x of extRows as { source: string; external_id: string }[]) {
          await supabaseAdmin
            .from("release_external_ids")
            .upsert(releaseExternalIdRow(winnerId, x.source, x.external_id), {
              onConflict: "source,external_id",
            });
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
      psn_mappings: psnMappings.length,
      fixed_game_id: fixedGameId,
      fixed_platform_key: fixedPlatformKey,
      merge_groups: plans.length,
      moved: {
        portfolio_entries: movedPortfolio,
        psn_title_progress: movedPsn,
        xbox_title_progress: movedXbox,
        steam_title_progress: movedSteam,
        ra_achievement_cache: movedRa,
        release_external_ids: movedExt,
      },
      deleted_releases: deletedReleases,
      note: "Canonical release per (psn, game_id) is the one referenced by release_external_ids(source='psn').",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "psn-canonicalizer failed" },
      { status: 500 }
    );
  }
}
