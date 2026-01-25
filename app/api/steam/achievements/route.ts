import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

const CACHE_TTL_MINUTES = 60 * 24; // 24h

function isFresh(fetchedAtIso: string) {
  const t = new Date(fetchedAtIso).getTime();
  if (!isFinite(t)) return false;
  return Date.now() - t < CACHE_TTL_MINUTES * 60_000;
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeEarned(a: any) {
  // Steam returns "achieved": 1/0 and optional "unlocktime" (unix seconds)
  const achieved = Number(a?.achieved ?? 0) === 1;
  const unlock = Number(a?.unlocktime ?? 0);
  const earned_at = unlock > 0 ? new Date(unlock * 1000).toISOString() : null;
  return { earned: achieved, earned_at };
}

function logSteamResolution(
  releaseId: string,
  source: "release_external_ids" | "steam_title_progress" | "releases" | "none",
  appid?: string
) {
  console.info("[SteamResolve]", {
    releaseId,
    source,
    appid: appid ?? null,
  });
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

  // 1) Find Steam appid mapping (release_external_ids)
  const { data: ext, error: extErr } = await supabase
    .from("release_external_ids")
    .select("external_id")
    .eq("release_id", releaseId)
    .eq("source", "steam")
    .maybeSingle();

  if (extErr) return NextResponse.json({ error: extErr.message }, { status: 500 });

  const appidFromExternalIds = String(ext?.external_id ?? "").trim();
  if (appidFromExternalIds) {
    logSteamResolution(releaseId, "release_external_ids", appidFromExternalIds);
    var appid = appidFromExternalIds;
  } else {
    // Fallback 1: if no mapping in release_external_ids, check steam_title_progress
    const { data: progress } = await supabase
      .from("steam_title_progress")
      .select("steam_appid")
      .eq("user_id", user.id)
      .eq("release_id", releaseId)
      .maybeSingle();

    const appidFromProgress = progress?.steam_appid ? String(progress.steam_appid) : "";
    if (appidFromProgress) {
      logSteamResolution(releaseId, "steam_title_progress", appidFromProgress);
      var appid = appidFromProgress;
    } else {
      // Fallback 2: check the release itself for steam_appid field (if releases table has it)
      const { data: release } = await supabase
        .from("releases")
        .select("steam_appid")
        .eq("id", releaseId)
        .maybeSingle();

      const appidFromRelease = release?.steam_appid ? String(release.steam_appid) : "";
      if (appidFromRelease) {
        logSteamResolution(releaseId, "releases", appidFromRelease);
        var appid = appidFromRelease;
      } else {
        logSteamResolution(releaseId, "none");
        return NextResponse.json({
          ok: true,
          cached: false,
          fetched_at: null,
          note: "No Steam mapping found for this release yet. Try running /api/steam/sync to create the mapping.",
          achievements: [],
        });
      }
    }
  }

  // 2) Cached?
  const { data: cachedRow } = await supabase
    .from("steam_achievement_cache")
    .select("fetched_at, payload")
    .eq("user_id", user.id)
    .eq("release_id", releaseId)
    .maybeSingle();

  if (!force && cachedRow?.fetched_at && isFresh(cachedRow.fetched_at)) {
    return NextResponse.json({
      ok: true,
      cached: true,
      fetched_at: cachedRow.fetched_at,
      ...(cachedRow.payload ?? {}),
    });
  }

  // 3) Load SteamID64 from profiles
  // IMPORTANT: your profiles table uses user_id (not id)
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("steam_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const steamId64 = String((profile as any)?.steam_id ?? "").trim();
  if (!steamId64) {
    return NextResponse.json({ error: "Steam not connected yet (missing profiles.steam_id)." }, { status: 400 });
  }

  const apiKey = String(process.env.STEAM_WEB_API_KEY ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "Missing STEAM_WEB_API_KEY env var" }, { status: 500 });

  // 4) Fetch achieved list
  // NOTE: Steam requires the gameName (API name) for GetPlayerAchievements.
  // This is NOT reliably the human title. So: we need a mapping for "steam_api_name"
  // OR we call GetSchemaForGame using appid and infer the API name isn't needed there.
  //
  // Easiest reliable path:
  // - Use ISteamUserStats/GetPlayerAchievements/v0001/?appid=APPID&...
  //
  // Steam supports 'appid' param in this endpoint, so we can avoid gameName.
  const achievedUrl =
    `https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/` +
    `?key=${encodeURIComponent(apiKey)}` +
    `&steamid=${encodeURIComponent(steamId64)}` +
    `&appid=${encodeURIComponent(appid)}`;

  // 5) Fetch schema for display names/icons
  const schemaUrl =
    `https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/` +
    `?key=${encodeURIComponent(apiKey)}` +
    `&appid=${encodeURIComponent(appid)}`;

  let achieved: any[] = [];
  let schemaAchievements: any[] = [];

  try {
    const [aRes, sRes] = await Promise.all([
      fetch(achievedUrl, { cache: "no-store" }),
      fetch(schemaUrl, { cache: "no-store" }),
    ]);

    const aJson = await aRes.json();
    const sJson = await sRes.json();

    // achieved list
    achieved = Array.isArray(aJson?.playerstats?.achievements) ? aJson.playerstats.achievements : [];

    // schema list
    schemaAchievements =
      Array.isArray(sJson?.game?.availableGameStats?.achievements)
        ? sJson.game.availableGameStats.achievements
        : [];
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Steam achievements fetch failed" }, { status: 500 });
  }

  const achievedMap = new Map<string, any>();
  for (const a of achieved) {
    const key = String(a?.apiname ?? "").trim();
    if (!key) continue;
    achievedMap.set(key, a);
  }

  const achievements = (schemaAchievements || []).map((s: any) => {
    const apiName = String(s?.name ?? s?.apiname ?? "").trim();
    const a = achievedMap.get(apiName) ?? null;
    const { earned, earned_at } = normalizeEarned(a);

    return {
      achievement_id: apiName,
      achievement_name: s?.displayName ?? null,
      achievement_description: s?.description ?? null,
      // Steam “points” not standard; keep null
      gamerscore: null,
      achievement_icon_url: s?.icon ?? null,
      rarity_percentage: null, // you can add global % later via GetGlobalAchievementPercentagesForApp
      earned,
      earned_at,
    };
  });

  // earned first; then newest earned first
  achievements.sort((a: any, b: any) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    const ta = a.earned_at ? new Date(a.earned_at).getTime() : 0;
    const tb = b.earned_at ? new Date(b.earned_at).getTime() : 0;
    return tb - ta;
  });

  const payload = {
    steam_appid: appid,
    achievements,
  };

  // 6) Upsert cache
  const { error: upErr } = await supabase
    .from("steam_achievement_cache")
    .upsert(
      {
        user_id: user.id,
        release_id: releaseId,
        fetched_at: nowIso(),
        payload,
        updated_at: nowIso(),
      },
      { onConflict: "user_id,release_id" }
    );

  if (upErr) console.warn("Steam achievement cache upsert failed:", upErr.message);

  return NextResponse.json({
    ok: true,
    cached: false,
    fetched_at: nowIso(),
    ...payload,
  });
}
