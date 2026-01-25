import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { raGetGameInfoAndUserProgress } from "@/lib/ra/server";

const CACHE_TTL_MINUTES = 60 * 24; // 24h (change later)

function isFresh(fetchedAtIso: string) {
  const t = new Date(fetchedAtIso).getTime();
  if (!isFinite(t)) return false;
  return Date.now() - t < CACHE_TTL_MINUTES * 60_000;
}

function normalizeEarned(a: any) {
  // RA APIs vary; handle common fields
  const earnedAt =
    a?.DateEarned ||
    a?.DateEarnedHardcore ||
    a?.dateEarned ||
    a?.dateEarnedHardcore ||
    null;

  // some endpoints return "1"/"0" strings or booleans
  const earnedFlag =
    a?.Earned === 1 ||
    a?.Earned === "1" ||
    a?.earned === true;

  const earned = Boolean(earnedAt) || Boolean(earnedFlag);

  return { earned, earned_at: earnedAt ? String(earnedAt) : null };
}

export async function GET(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = userRes.user;

  const url = new URL(req.url);
  const releaseId = url.searchParams.get("release_id");
  const force = url.searchParams.get("force") === "1";

  if (!releaseId) return NextResponse.json({ error: "Missing release_id" }, { status: 400 });

  // 1) Find RA game id for this release via release_external_ids
  const { data: ext, error: extErr } = await supabase
    .from("release_external_ids")
    .select("external_id")
    .eq("release_id", releaseId)
    .eq("source", "ra")
    .maybeSingle();

  if (extErr) return NextResponse.json({ error: extErr.message }, { status: 500 });
  const raGameId = ext?.external_id ? Number(ext.external_id) : null;

  if (!raGameId || !isFinite(raGameId)) {
    return NextResponse.json({
      ok: true,
      cached: false,
      fetched_at: null,
      note: "No RetroAchievements mapping found for this release yet (release_external_ids.source='ra').",
      achievements: [],
    });
  }

  // 2) Read cached row
  const { data: cachedRow } = await supabase
    .from("ra_achievement_cache")
    .select("fetched_at, payload")
    .eq("user_id", user.id)
    .eq("release_id", releaseId)
    .maybeSingle();

  if (!force && cachedRow?.fetched_at && isFresh(cachedRow.fetched_at)) {
    const payload = cachedRow.payload ?? {};
    return NextResponse.json({
      ok: true,
      cached: true,
      fetched_at: cachedRow.fetched_at,
      ...payload,
    });
  }

  // 3) Load user RA credentials
  const { data: conn, error: connErr } = await supabase
    .from("user_ra_connections")
    .select("ra_username, ra_api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (connErr) {
    return NextResponse.json({ error: connErr.message }, { status: 500 });
  }

  if (!conn?.ra_username || !conn?.ra_api_key) {
    return NextResponse.json({ error: "RetroAchievements not connected yet." }, { status: 400 });
  }

  const raUsername = conn.ra_username;
  const raApiKey = conn.ra_api_key;

  // 4) Fetch from RA
  const ra = await raGetGameInfoAndUserProgress(raUsername, raApiKey, raGameId);

  const { data: relRow } = await supabase
    .from("releases")
    .select("display_title")
    .eq("id", releaseId)
    .maybeSingle();

  const releaseTitle = String(relRow?.display_title ?? "").toLowerCase();
  const raTitle = String((ra as any)?.title ?? "").toLowerCase();

  if (releaseTitle && raTitle && !raTitle.includes(releaseTitle.split(" ")[0])) {
    return NextResponse.json({
      ok: true,
      note: `RA mapping mismatch: release="${releaseTitle}" vs ra="${raTitle}". Fix release_external_ids.`,
      ra_game_id: raGameId,
      achievements: [],
    });
  }

  // ra.achievements is an object keyed by id (per docs)
  const achievementsObj = (ra as any)?.achievements ?? {};
  const rawAchievements = Object.values(achievementsObj);
  const achievements = (rawAchievements || []).map((a: any) => {
    const { earned, earned_at } = normalizeEarned(a);

    return {
      achievement_id: String(a?.ID ?? a?.AchievementID ?? a?.id ?? ""),
      achievement_name: a?.Title ?? a?.name ?? null,
      achievement_description: a?.Description ?? a?.description ?? null,
      gamerscore: a?.Points != null ? Number(a.Points) : null,
      achievement_icon_url: a?.BadgeURL ?? a?.icon ?? null,
      rarity_percentage: a?.Rarity != null ? Number(a.Rarity) : null,
      earned,
      earned_at,
    };
  });

  // 5) Sort: earned first, then not earned; within each group keep stable order (displayOrder if present, else title)
  achievements.sort((a: any, b: any) => {
    // earned first
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    // then newest earned first (if both earned)
    const ta = a.earned_at ? new Date(a.earned_at).getTime() : 0;
    const tb = b.earned_at ? new Date(b.earned_at).getTime() : 0;
    return tb - ta;
  });

  const payload = {
    ra_game_id: raGameId,
    game: {
      id: (ra as any)?.id ?? null,
      title: (ra as any)?.title ?? null,
      consoleName: (ra as any)?.consoleName ?? null,
      imageBoxArt: (ra as any)?.imageBoxArt ?? null,
      imageTitle: (ra as any)?.imageTitle ?? null,
      imageIngame: (ra as any)?.imageIngame ?? null,
      imageIcon: (ra as any)?.imageIcon ?? null,
    },
    progress: {
      userCompletion: (ra as any)?.userCompletion ?? null,
      userCompletionHardcore: (ra as any)?.userCompletionHardcore ?? null,
      numAwardedToUser: (ra as any)?.numAwardedToUser ?? null,
      numAchievements: (ra as any)?.numAchievements ?? null,
      userTotalPlaytime: (ra as any)?.userTotalPlaytime ?? null,
      highestAwardKind: (ra as any)?.highestAwardKind ?? null,
      highestAwardDate: (ra as any)?.highestAwardDate ?? null,
    },
    achievements,
  };

  // 6) Upsert cache
  const { error: upErr } = await supabase
    .from("ra_achievement_cache")
    .upsert(
      {
        user_id: user.id,
        release_id: releaseId,
        fetched_at: new Date().toISOString(),
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,release_id" }
    );

  if (upErr) {
    // Don’t fail the request if caching fails
    console.warn("RA cache upsert failed:", upErr.message);
  }

  return NextResponse.json({
    ok: true,
    cached: false,
    fetched_at: new Date().toISOString(),
    ...payload,
  });
}
