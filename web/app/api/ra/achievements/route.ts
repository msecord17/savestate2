import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";
import { raGetGameInfoAndUserProgress } from "@/lib/ra/server";
import { mapReleaseToRA } from "@/lib/ra/map-release";

const CACHE_TTL_MINUTES = 60 * 24; // 24h for normal
const CACHE_TTL_NO_SET_MINUTES = 60 * 24 * 7; // 7 days for "no_set" status

function isFresh(fetchedAtIso: string, ttlMinutes?: number) {
  const t = new Date(fetchedAtIso).getTime();
  if (!isFinite(t)) return false;
  const ttl = ttlMinutes ?? CACHE_TTL_MINUTES;
  return Date.now() - t < ttl * 60_000;
}

function raBadgeUrls(badgeNameRaw: any) {
  const badge = String(badgeNameRaw ?? "").trim();
  if (!badge) return { unlocked: null as string | null, locked: null as string | null };

  // Some data may already include _lock; normalize it away
  const clean = badge.replace(/_lock$/i, "");

  return {
    unlocked: `https://media.retroachievements.org/Badge/${clean}.png`,
    locked: `https://media.retroachievements.org/Badge/${clean}_lock.png`,
  };
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
  let { data: ext, error: extErr } = await supabase
    .from("release_external_ids")
    .select("external_id")
    .eq("release_id", releaseId)
    .eq("source", "ra")
    .maybeSingle();

  if (extErr) return NextResponse.json({ error: extErr.message }, { status: 500 });

  let raGameId = ext?.external_id ? Number(ext.external_id) : null;

  // ─────────────────────────────────────────────
  // AUTO-MAP if missing
  // ─────────────────────────────────────────────
  if (!raGameId || !Number.isFinite(raGameId)) {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Try to map automatically - helper will load credentials from user_ra_connections
    const mapped = await mapReleaseToRA(supabaseAdmin, releaseId, { 
      dryRun: false,
      userId: user.id,
    });

    if (!mapped.ok || !mapped.ra_game_id) {
      return NextResponse.json({
        ok: true,
        cached: false,
        fetched_at: null,
        ra_game_id: null,
        ra_status: "unmapped",
        ra_num_achievements: 0,
        note: mapped.note || "No RetroAchievements mapping found (auto-map failed).",
        achievements: [],
      });
    }

    raGameId = mapped.ra_game_id;
  }

  // 2) Read cached row
  const { data: cachedRow } = await supabase
    .from("ra_achievement_cache")
    .select("fetched_at, payload")
    .eq("user_id", user.id)
    .eq("release_id", releaseId)
    .maybeSingle();

  if (!force && cachedRow?.fetched_at) {
    const payload = cachedRow.payload ?? {};
    // Use longer TTL for "no_set" status (7 days vs 24 hours)
    const ttlMinutes = payload.ra_status === "no_set" ? CACHE_TTL_NO_SET_MINUTES : CACHE_TTL_MINUTES;
    
    if (isFresh(cachedRow.fetched_at, ttlMinutes)) {
      return NextResponse.json({
        ok: true,
        cached: true,
        fetched_at: cachedRow.fetched_at,
        ...payload,
      });
    }
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
  const ra_num_achievements = rawAchievements.length;
  const ra_status: "has_set" | "no_set" = ra_num_achievements > 0 ? "has_set" : "no_set";
  
  const achievements = (rawAchievements || []).map((a: any) => {
    const { earned, earned_at } = normalizeEarned(a);

    const badgeName = a?.badgeName ?? a?.BadgeName;
    const { unlocked, locked } = raBadgeUrls(badgeName);
    const icon = earned ? unlocked : locked;

    return {
      achievement_id: String(a?.id ?? a?.ID ?? ""),
      achievement_name: a?.title ?? a?.Title ?? null,
      achievement_description: a?.description ?? a?.Description ?? null,
      gamerscore: a?.points != null ? Number(a.points) : (a?.Points != null ? Number(a.Points) : null),
      achievement_icon_url: icon,          // ✅ this is what you want
      rarity_percentage: a?.trueRatio != null ? Number(a.trueRatio) : (a?.Rarity != null ? Number(a.Rarity) : null),
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
    ra_status,
    ra_num_achievements,
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
