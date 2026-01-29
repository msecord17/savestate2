import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";
import {
  getXboxAuthorization,
  fetchXboxProfile,
  fetchXboxAchievementsForTitle,
} from "@/lib/xbox/server";

function nowIso() {
  return new Date().toISOString();
}

export async function POST(req: Request) {
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    const body = await req.json().catch(() => ({}));
    const release_id = String(body?.release_id ?? "").trim();
    if (!release_id) {
      return NextResponse.json({ error: "Missing release_id" }, { status: 400 });
    }

    // Service role for achievement upserts
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Load profile creds
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

    // Get authorization
    const authorization = await getXboxAuthorization(accessToken);

    // Get XUID (use stored or fetch from profile)
    let xuid = String(profile?.xbox_xuid ?? "").trim();
    if (!xuid) {
      const prof = await fetchXboxProfile(authorization);
      xuid = prof.xuid;
      // Optionally save xuid to profile
      await supabaseUser
        .from("profiles")
        .update({ xbox_xuid: xuid, updated_at: nowIso() })
        .eq("user_id", user.id);
    }

    // Resolve title_id from xbox_title_progress for this release
    const { data: tp, error: tpErr } = await supabaseUser
      .from("xbox_title_progress")
      .select("title_id")
      .eq("user_id", user.id)
      .eq("release_id", release_id)
      .order("last_updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tpErr) return NextResponse.json({ error: tpErr.message }, { status: 500 });

    const titleId = String(tp?.title_id ?? "").trim();
    if (!titleId) {
      return NextResponse.json({ error: "No title_id found for this release_id" }, { status: 400 });
    }

    // Fetch achievements from Xbox API
    const achievements = await fetchXboxAchievementsForTitle(authorization, xuid, titleId);

    let upserted = 0;

    const getId = (ach: any) =>
      String(ach?.id ?? ach?.achievementId ?? ach?.achievement_id ?? "").trim();

    const getUnlockIso = (ach: any): string | null => {
      const raw =
        ach?.unlockedDateTime ??
        ach?.unlockTime ??
        ach?.progression?.timeUnlocked ??
        ach?.progression?.unlockedDateTime ??
        null;
      if (!raw) return null;
      const t = new Date(String(raw)).getTime();
      return isFinite(t) ? new Date(t).toISOString() : null;
    };

    const isEarned = (ach: any): boolean => {
      const progressState = String(ach?.progressState ?? ach?.progress_state ?? "").toLowerCase();
      const state = String(ach?.state ?? "").toLowerCase();

      const unlocked =
        Boolean(ach?.isUnlocked) ||
        Boolean(ach?.unlocked) ||
        Boolean(ach?.isAchieved) ||
        progressState === "achieved" ||
        progressState === "unlocked" ||
        state === "unlocked";

      if (getUnlockIso(ach)) return true;

      const pct = Number(ach?.progressPercentage ?? ach?.progress_percentage ?? NaN);
      if (isFinite(pct) && pct >= 100) return true;

      const reqs = Array.isArray(ach?.progression?.requirements) ? ach.progression.requirements : [];
      const completedReq = reqs.some((r: any) => {
        const current = Number(r?.current ?? NaN);
        const target = Number(r?.target ?? NaN);
        return isFinite(current) && isFinite(target) && target > 0 && current >= target;
      });

      return unlocked || completedReq;
    };

    // Upsert achievements into cache
    for (const ach of achievements) {
      const achievementId = getId(ach);
      if (!achievementId) continue;

      const earned = isEarned(ach);
      const unlockTime = getUnlockIso(ach);

      const row = {
        user_id: user.id,
        release_id,
        title_id: titleId,
        achievement_id: achievementId,

        achievement_name: ach?.name ?? null,
        achievement_description: ach?.description ?? null,
        gamerscore: ach?.gamerscore != null ? Number(ach.gamerscore) : null,
        achievement_icon_url: ach?.mediaAssets?.find((m: any) => m?.name === "Icon")?.url ?? null,
        rarity_percentage: ach?.rarity?.currentPercentage != null ? Number(ach.rarity.currentPercentage) : null,

        earned,
        earned_at: unlockTime,

        updated_at: nowIso(),
      };

      const { error: upErr } = await supabaseAdmin
        .from("xbox_achievements")
        .upsert(row, {
          onConflict: "user_id,title_id,achievement_id",
        });

      if (!upErr) upserted += 1;
    }

    return NextResponse.json({
      ok: true,
      release_id,
      title_id: titleId,
      upserted,
      total: achievements.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to hydrate achievements" }, { status: 500 });
  }
}
