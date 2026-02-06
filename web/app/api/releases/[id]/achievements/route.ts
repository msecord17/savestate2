import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";
import {
  getXboxAuthorization,
  fetchXboxProfile,
  fetchXboxAchievementsForTitle,
} from "@/lib/xbox/server";

// Cache TTL: 12 hours
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

function isFresh(iso: string | null) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return isFinite(t) && Date.now() - t < CACHE_TTL_MS;
}

function getXboxAchievementId(ach: any): string {
  // Different contract versions / shapes can use different keys
  return String(
    ach?.id ??
      ach?.achievementId ??
      ach?.achievement_id ??
      ""
  ).trim();
}

function getXboxAchievementUnlockTimeIso(ach: any): string | null {
  const raw =
    ach?.unlockedDateTime ??
    ach?.unlockTime ??
    ach?.progression?.timeUnlocked ??
    ach?.progression?.unlockedDateTime ??
    null;
  if (!raw) return null;
  const t = new Date(String(raw)).getTime();
  return isFinite(t) ? new Date(t).toISOString() : null;
}

function isXboxAchievementEarned(ach: any): boolean {
  const progressState = String(ach?.progressState ?? ach?.progress_state ?? "").toLowerCase();
  const state = String(ach?.state ?? "").toLowerCase();

  const unlocked =
    Boolean(ach?.isUnlocked) ||
    Boolean(ach?.unlocked) ||
    Boolean(ach?.isAchieved) ||
    progressState === "achieved" ||
    progressState === "unlocked" ||
    state === "unlocked";

  const unlockTime = getXboxAchievementUnlockTimeIso(ach);
  if (unlockTime) return true;

  const pct = Number(ach?.progressPercentage ?? ach?.progress_percentage ?? NaN);
  if (isFinite(pct) && pct >= 100) return true;

  // Some shapes expose requirements progress
  const reqs = Array.isArray(ach?.progression?.requirements) ? ach.progression.requirements : [];
  const completedReq = reqs.some((r: any) => {
    const current = Number(r?.current ?? NaN);
    const target = Number(r?.target ?? NaN);
    return isFinite(current) && isFinite(target) && target > 0 && current >= target;
  });

  return unlocked || completedReq;
}

async function pickBestTitleId(opts: {
  supabaseUser: any;
  userId: string;
  releaseId: string;
  candidates: any[];
}): Promise<string> {
  const { supabaseUser, userId, releaseId, candidates } = opts;

  // Prefer the title_id that has the most cached achievements (usually the base game vs DLC)
  let best: { title_id: string; count: number; last_updated_at: string | null } | null = null;
  const top = candidates.slice(0, 8);

  for (const c of top) {
    const tid = String(c?.title_id ?? "").trim();
    if (!tid || isNaN(Number(tid))) continue;

    const { count } = await supabaseUser
      .from("xbox_achievements")
      // head+count to avoid pulling rows
      .select("achievement_id", { head: true, count: "exact" } as any)
      .eq("user_id", userId)
      .eq("release_id", releaseId)
      .eq("title_id", tid);

    const n = typeof count === "number" ? count : 0;
    const last = c?.last_updated_at ? String(c.last_updated_at) : null;

    if (!best || n > best.count) {
      best = { title_id: tid, count: n, last_updated_at: last };
    }
  }

  if (best && best.count > 0) return best.title_id;

  // Fallback: prefer non-DLC-ish title names, then newest updated
  const isDlcish = (name: string) => {
    const s = (name || "").toLowerCase();
    return s.includes("dlc") || s.includes("add-on") || s.includes("addon") || s.includes("expansion") || s.includes("season pass");
  };

  const newestNonDlc = top
    .map((c) => ({
      tid: String(c?.title_id ?? "").trim(),
      name: String(c?.title_name ?? ""),
      t: c?.last_updated_at ? new Date(c.last_updated_at).getTime() : 0,
    }))
    .filter((x) => x.tid && !isNaN(Number(x.tid)) && !isDlcish(x.name))
    .sort((a, b) => b.t - a.t)[0];

  const newestAny = top
    .map((c) => ({ tid: String(c?.title_id ?? "").trim(), t: c?.last_updated_at ? new Date(c.last_updated_at).getTime() : 0 }))
    .filter((x) => x.tid && !isNaN(Number(x.tid)))
    .sort((a, b) => b.t - a.t)[0];

  return newestNonDlc?.tid || newestAny?.tid || String(candidates[0]?.title_id ?? "").trim();
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id: releaseId } = await ctx.params;
    if (!releaseId || releaseId === "undefined") {
      return NextResponse.json({ error: "Missing release id" }, { status: 400 });
    }

    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // 1) Find Xbox mappings for this release (can be multiple: base + DLC)
    const { data: xboxRows, error: xboxErr } = await supabaseUser
      .from("xbox_title_progress")
      .select("title_id, title_name, last_updated_at")
      .eq("user_id", user.id)
      .eq("release_id", releaseId);

    if (xboxErr) return NextResponse.json({ error: xboxErr.message }, { status: 500 });
    const rows = Array.isArray(xboxRows) ? xboxRows : [];

    // Also consider releases.xbox_title_id as a candidate (often the "base" title id)
    const { data: releaseRow } = await supabaseUser
      .from("releases")
      .select("xbox_title_id, display_title")
      .eq("id", releaseId)
      .maybeSingle();

    // Filter to only valid numeric title_ids (Xbox API requires numeric IDs)
    const withIds = rows.filter((r) => {
      const tid = String(r?.title_id ?? "").trim();
      return tid && !isNaN(Number(tid));
    });

    const releaseTitleId = String((releaseRow as any)?.xbox_title_id ?? "").trim();
    if (releaseTitleId && !isNaN(Number(releaseTitleId))) {
      const exists = withIds.some((r) => String(r?.title_id ?? "").trim() === releaseTitleId);
      if (!exists) {
        withIds.unshift({
          title_id: releaseTitleId,
          title_name: String((releaseRow as any)?.display_title ?? "release.xbox_title_id"),
          last_updated_at: null,
          _source: "releases.xbox_title_id",
        } as any);
      }
    }
    
    if (!withIds.length) {
      return NextResponse.json({ 
        error: "No valid Xbox title_id found for this release. The game may not have a valid titleId, or achievements may not be available.",
        debug: { 
          totalRows: rows.length,
          rowsWithoutTitleId: rows.filter((r) => !r?.title_id).length,
          rowsWithInvalidTitleId: rows.filter((r) => {
            const tid = String(r?.title_id ?? "").trim();
            return tid && isNaN(Number(tid));
          }).length,
        }
      }, { status: 404 });
    }

    const url = new URL(req.url);
    const requestedTitleId = String(url.searchParams.get("title_id") ?? "").trim();

    let titleId = "";
    if (requestedTitleId && !isNaN(Number(requestedTitleId))) {
      // Only allow selecting from mapped IDs for this release
      const ok = withIds.some((r) => String(r?.title_id ?? "").trim() === requestedTitleId);
      if (ok) titleId = requestedTitleId;
    }

    if (!titleId) {
      titleId = await pickBestTitleId({
        supabaseUser,
        userId: user.id,
        releaseId,
        candidates: withIds,
      });
    }
    
    // Validate titleId is numeric before calling API
    if (!titleId || isNaN(Number(titleId))) {
      return NextResponse.json({ 
        error: `Invalid title_id format: "${titleId}". Expected numeric value.`,
        debug: { titleId, allRows: rows }
      }, { status: 400 });
    }

    const choices = withIds.slice(0, 8).map((r) => ({
      title_id: r.title_id,
      title_name: r.title_name,
      last_updated_at: r.last_updated_at,
    }));

    // 2) Try cache first (if you have xbox_achievement_cache table)
    // For now, we'll fetch from xbox_achievements table
    const { data: cached, error: cErr } = await supabaseUser
      .from("xbox_achievements")
      .select("updated_at")
      .eq("user_id", user.id)
      .eq("release_id", releaseId)
      .eq("title_id", titleId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const isCached = !cErr && cached?.updated_at && isFresh(cached.updated_at);

    if (isCached) {
      const { data: achievements, error: aErr } = await supabaseUser
        .from("xbox_achievements")
        .select(
          "achievement_id,achievement_name,achievement_description,gamerscore,achievement_icon_url,rarity_percentage,earned,earned_at"
        )
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .eq("title_id", titleId)
        .order("gamerscore", { ascending: false })
        .order("achievement_id", { ascending: true });

      if (!aErr && achievements) {
        // Heuristic: if cache only contains earned achievements (common failure mode),
        // bypass cache and refetch from API to recover full list.
        const allEarned =
          achievements.length > 0 && achievements.every((a: any) => Boolean(a?.earned));
        if (!allEarned) {
        return NextResponse.json({
          ok: true,
          cached: true,
          title_id: titleId,
          achievements: achievements,
          earned: achievements.filter((a) => a.earned),
          fetched_at: cached.updated_at,
          choices,
        });
        }
      }
    }

    // 3) Need access token to call Xbox API
    const { data: profile, error: pErr } = await supabaseUser
      .from("profiles")
      .select("xbox_access_token, xbox_xuid")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const accessToken = String(profile?.xbox_access_token ?? "").trim();
    if (!accessToken) {
      return NextResponse.json({ error: "Xbox not connected (missing access token)" }, { status: 400 });
    }

    // 4) Call Xbox API
    const authorization = await getXboxAuthorization(accessToken);

    let xuid = String(profile?.xbox_xuid ?? "").trim();
    if (!xuid) {
      const prof = await fetchXboxProfile(authorization);
      xuid = prof.xuid;
    }

    console.log(`[Xbox Achievements] Fetching achievements for title_id: ${titleId}, release_id: ${releaseId}`);
    const achievements = await fetchXboxAchievementsForTitle(authorization, xuid, titleId);
    
    if (!Array.isArray(achievements) || achievements.length === 0) {
      console.warn(`[Xbox Achievements] No achievements returned for title_id: ${titleId}`);
      return NextResponse.json({
        ok: true,
        cached: false,
        title_id: titleId,
        achievements: [],
        earned: [],
        fetched_at: new Date().toISOString(),
        choices,
        warning: "Xbox API returned no achievements for this title. This might mean the game has no achievements, or the title_id is incorrect.",
      });
    }
    
    console.log(`[Xbox Achievements] Fetched ${achievements.length} achievements for title_id: ${titleId}`);

    // 5) Upsert cache
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Log first achievement structure for debugging
    if (achievements.length > 0) {
      console.log(`[Xbox Achievements] First achievement sample:`, JSON.stringify(achievements[0]).slice(0, 1000));
    }

    for (const ach of achievements) {
      const achievementId = getXboxAchievementId(ach);
      if (!achievementId) continue;

      const isEarned = isXboxAchievementEarned(ach);
      const unlockTime = getXboxAchievementUnlockTimeIso(ach);
      
      // Log if we detect an earned achievement for debugging
      if (isEarned && achievements.indexOf(ach) < 3) {
        console.log(`[Xbox Achievements] Earned achievement detected:`, {
          id: achievementId,
          name: ach?.name,
          hasUnlockTime: Boolean(getXboxAchievementUnlockTimeIso(ach)),
          progressState: ach?.progressState,
          isUnlocked: ach?.isUnlocked,
          state: ach?.state,
          progressPercentage: ach?.progressPercentage,
        });
      }

      await supabaseAdmin.from("xbox_achievements").upsert(
        {
          user_id: user.id,
          release_id: releaseId,
          title_id: titleId,
          achievement_id: achievementId,
          achievement_name: ach?.name ?? null,
          achievement_description: ach?.description ?? null,
          gamerscore: ach?.gamerscore != null ? Number(ach.gamerscore) : null,
          achievement_icon_url: ach?.mediaAssets?.find((m: any) => m?.name === "Icon")?.url ?? null,
          rarity_percentage: ach?.rarity?.currentPercentage != null ? Number(ach.rarity.currentPercentage) : null,
          earned: isEarned,
          earned_at: unlockTime,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,title_id,achievement_id" }
      );
    }

    // Format response
    const formatted = achievements.map((ach: any) => {
      const earned = isXboxAchievementEarned(ach);
      
      return {
        achievement_id: getXboxAchievementId(ach),
        achievement_name: ach?.name ?? null,
        achievement_description: ach?.description ?? null,
        gamerscore: ach?.gamerscore != null ? Number(ach.gamerscore) : null,
        achievement_icon_url: ach?.mediaAssets?.find((m: any) => m?.name === "Icon")?.url ?? null,
        rarity_percentage: ach?.rarity?.currentPercentage != null ? Number(ach.rarity.currentPercentage) : null,
        earned,
        earned_at: getXboxAchievementUnlockTimeIso(ach),
      };
    });
    
    const earnedCount = formatted.filter((a) => a.earned).length;
    console.log(`[Xbox Achievements] Formatted ${formatted.length} achievements, ${earnedCount} marked as earned`);

    return NextResponse.json({
      ok: true,
      cached: false,
      title_id: titleId,
      achievements: formatted,
      earned: formatted.filter((a) => a.earned),
      fetched_at: new Date().toISOString(),
      choices,
      debug_counts: {
        total: formatted.length,
        earned: formatted.filter((a) => a.earned).length,
        unearned: formatted.filter((a) => !a.earned).length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load achievements" }, { status: 500 });
  }
}
