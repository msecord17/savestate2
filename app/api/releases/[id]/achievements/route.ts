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

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
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

    // Filter to only valid numeric title_ids (Xbox API requires numeric IDs)
    const withIds = rows.filter((r) => {
      const tid = String(r?.title_id ?? "").trim();
      return tid && !isNaN(Number(tid));
    });
    
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

    // Prefer newest updated
    withIds.sort((a, b) => {
      const aTime = a.last_updated_at ? new Date(a.last_updated_at).getTime() : 0;
      const bTime = b.last_updated_at ? new Date(b.last_updated_at).getTime() : 0;
      return bTime - aTime;
    });

    const chosen = withIds[0];
    const titleId = String(chosen.title_id).trim();
    
    // Validate titleId is numeric before calling API
    if (!titleId || isNaN(Number(titleId))) {
      return NextResponse.json({ 
        error: `Invalid title_id format: "${titleId}". Expected numeric value.`,
        debug: { chosen, allRows: rows }
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
      const achievementId = String(ach?.id ?? "").trim();
      if (!achievementId) continue;

      // Check multiple fields to determine if earned:
      // 1. unlockedDateTime exists (strongest indicator)
      // 2. progressState === "Achieved"
      // 3. isUnlocked === true
      // 4. state === "Unlocked"
      // 5. progressPercentage === 100
      const hasUnlockTime = !!ach?.unlockedDateTime;
      const progressStateAchieved = ach?.progressState === "Achieved";
      const isUnlocked = Boolean(ach?.isUnlocked);
      const stateUnlocked = ach?.state === "Unlocked";
      const progressComplete = ach?.progressPercentage === 100;
      
      const isEarned = hasUnlockTime || progressStateAchieved || isUnlocked || stateUnlocked || progressComplete;
      
      const unlockTime = ach?.unlockedDateTime ? new Date(ach.unlockedDateTime).toISOString() : null;
      
      // Log if we detect an earned achievement for debugging
      if (isEarned && achievements.indexOf(ach) < 3) {
        console.log(`[Xbox Achievements] Earned achievement detected:`, {
          id: achievementId,
          name: ach?.name,
          hasUnlockTime,
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
      const hasUnlockTime = !!ach?.unlockedDateTime;
      const progressStateAchieved = ach?.progressState === "Achieved";
      const isUnlocked = Boolean(ach?.isUnlocked);
      const stateUnlocked = ach?.state === "Unlocked";
      const progressComplete = ach?.progressPercentage === 100;
      const earned = hasUnlockTime || progressStateAchieved || isUnlocked || stateUnlocked || progressComplete;
      
      return {
        achievement_id: String(ach?.id ?? ""),
        achievement_name: ach?.name ?? null,
        achievement_description: ach?.description ?? null,
        gamerscore: ach?.gamerscore != null ? Number(ach.gamerscore) : null,
        achievement_icon_url: ach?.mediaAssets?.find((m: any) => m?.name === "Icon")?.url ?? null,
        rarity_percentage: ach?.rarity?.currentPercentage != null ? Number(ach.rarity.currentPercentage) : null,
        earned,
        earned_at: ach?.unlockedDateTime ? new Date(ach.unlockedDateTime).toISOString() : null,
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
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load achievements" }, { status: 500 });
  }
}
