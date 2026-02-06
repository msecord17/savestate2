import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

/** Stable label for release.platform_label and xbox_title_progress.title_platform (used for played-on generation). */
export type XboxPlatformLabel = "Xbox 360" | "Xbox One" | "Xbox Series";

type TitleOut = {
  name: string;
  titleId?: string;
  pfTitleId?: string;
  devices?: string[];
  /** Resolved generation: Xbox 360 | Xbox One | Xbox Series. From contract version + devices when available. */
  platform_label?: XboxPlatformLabel;
  achievements_earned?: number;
  achievements_total?: number;
  gamerscore_earned?: number;
  gamerscore_total?: number;
  last_played_at?: string | null;
};

function jsonOrNull(text: string) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function isoOrNull(v: any): string | null {
  if (!v) return null;
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}

/** Derive stable platform label from API source + raw title (devices/platform). */
function xboxPlatformLabelFromRaw(t: any): XboxPlatformLabel {
  const source = t?._sourcePlatform as string | undefined;
  if (source === "Xbox 360") return "Xbox 360";

  // Contract v2 = One/Series; try to distinguish via devices or platform
  const devices = Array.isArray(t?.devices) ? t.devices as string[] : [];
  const platformStr = [t?.platform, t?.titlePlatform, t?.platformId, ...devices]
    .filter(Boolean)
    .map((s: any) => String(s).toLowerCase())
    .join(" ");
  if (/\bseries\b|xboxseries|gen9/.test(platformStr)) return "Xbox Series";
  if (/\bone\b|xboxone|gen8/.test(platformStr)) return "Xbox One";

  // Default for v2 when no devices/platform: treat as Xbox One (most common)
  return "Xbox One";
}

// 1) XBL user.authenticate
async function xblAuthenticate(accessToken: string) {
  const res = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "en-US",
      Accept: "application/json",
    },
    body: JSON.stringify({
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${accessToken}`, // IMPORTANT
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    }),
  });

  const text = await res.text();
  const json = jsonOrNull(text);

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      error: `XBL user.authenticate failed (${res.status})`,
      detail: json ?? text,
    };
  }

  return { ok: true as const, token: json?.Token as string };
}

// 2) XSTS authorize
async function xstsAuthorize(xblToken: string) {
  const res = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "en-US",
      Accept: "application/json",
    },
    body: JSON.stringify({
      Properties: {
        SandboxId: "RETAIL",
        UserTokens: [xblToken],
      },
      RelyingParty: "http://xboxlive.com",
      TokenType: "JWT",
    }),
  });

  const text = await res.text();
  const json = jsonOrNull(text);

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      error: `XSTS authorize failed (${res.status})`,
      detail: json ?? text,
    };
  }

  const xstsToken = json?.Token as string;
  const uhs = json?.DisplayClaims?.xui?.[0]?.uhs as string | undefined;

  return { ok: true as const, token: xstsToken, uhs: uhs ?? null };
}

// Helper: common XBL Authorization header format
function xblAuthHeader(uhs: string, xstsToken: string) {
  return `XBL3.0 x=${uhs};${xstsToken}`;
}

// 3) Profile: get xuid + gamertag
async function fetchProfile(authorization: string) {
  const res = await fetch("https://profile.xboxlive.com/users/me/profile/settings", {
    method: "GET",
    headers: {
      Authorization: authorization,
      "x-xbl-contract-version": "2",
      "Accept-Language": "en-US",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  const json = jsonOrNull(text);

  if (!res.ok) {
    return {
      ok: false as const,
      status: res.status,
      error: `Profile failed (${res.status})`,
      detail: json ?? text,
    };
  }

  // xuid is in profileUsers[0].id typically
  const xuid = json?.profileUsers?.[0]?.id ?? null;

  // gamertag often in settings array
  const settings = json?.profileUsers?.[0]?.settings ?? [];
  const gamertag =
    settings.find((s: any) => s?.id === "Gamertag")?.value ??
    settings.find((s: any) => s?.id === "GameDisplayName")?.value ??
    null;

  return { ok: true as const, xuid, gamertag };
}

// 4) Achievements history titles (earned/total + gamerscore)
// Note: This endpoint only returns games that have achievements.
// It supports pagination via continuationToken.
// IMPORTANT: Xbox 360 uses contract version 1, Xbox One/Series uses version 2
// We need to query BOTH to get all games!
async function fetchAchievementHistoryTitles(authorization: string, xuid: string) {
  const allTitles: any[] = [];
  const platformDebugs: any[] = [];
  
  // Fetch from both Xbox 360 (v1) and Xbox One/Series (v2)
  const platforms = [
    { version: "1", name: "Xbox 360" },
    { version: "2", name: "Xbox One/Series" },
  ];
  
  for (const platform of platforms) {
    try {
    let continuationToken: string | null = null;
    let pageCount = 0;
    const maxPages = 20; // Safety limit per platform
    let platformTitlesCount = 0; // Track titles for this platform

    do {
      pageCount++;
      if (pageCount > maxPages) {
        console.warn(`[Xbox ${platform.name}] Hit max pages (${maxPages}), stopping pagination`);
        break;
      }

      let url = `https://achievements.xboxlive.com/users/xuid(${encodeURIComponent(
        xuid
      )})/history/titles?maxItems=500`;
      
      // Try both query param and header for continuation token
      const headers: Record<string, string> = {
        Authorization: authorization,
        "x-xbl-contract-version": platform.version,
        "Accept-Language": "en-US",
        Accept: "application/json",
      };
      
      if (continuationToken) {
        // Try as query parameter first
        url += `&continuationToken=${encodeURIComponent(continuationToken)}`;
        // Also try as header (some APIs use this)
        headers["X-Continuation-Token"] = continuationToken;
      }

    const res = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const text = await res.text();
    const json = jsonOrNull(text);

    // Check for continuation token in headers too
    const headerContinuationToken = res.headers.get("X-Continuation-Token") ?? 
                                    res.headers.get("x-continuation-token") ??
                                    res.headers.get("Continuation-Token") ??
                                    null;

    if (!res.ok) {
      console.error(`[Xbox ${platform.name}] API error (${res.status}):`, json ?? text);
      // Don't fail the whole thing - continue to next platform
      break;
    }

    // Add titles from this page; tag each with source platform for generation (360 vs One/Series)
    const pageTitles = Array.isArray(json?.titles) ? json.titles : [];

    // Debug: log response structure (always log first page per platform)
    const debugInfo: any = {
      platform: platform.name,
      contractVersion: platform.version,
      page: pageCount,
      topLevelKeys: json ? Object.keys(json) : [],
      titlesCount: pageTitles.length,
      hasPagingInfo: !!json?.pagingInfo,
      pagingInfoKeys: json?.pagingInfo ? Object.keys(json.pagingInfo) : [],
      pagingInfo: json?.pagingInfo ? JSON.parse(JSON.stringify(json.pagingInfo)) : null, // Deep clone to show full object
      headerContinuationToken: headerContinuationToken,
      allResponseHeaders: Object.fromEntries(res.headers.entries()),
      fullJsonSample: JSON.stringify(json).slice(0, 2000), // First 2000 chars of full response
    };
    
    if (pageCount === 1 && pageTitles.length > 0) {
      // Store first page debug + one raw title sample (to find One vs Series fields)
      platformDebugs.push({
        ...debugInfo,
        rawTitleSample: pageTitles[0],
        rawTitleSampleKeys: pageTitles[0] ? Object.keys(pageTitles[0]) : [],
      });
      console.log(`[Xbox ${platform.name}] Page 1 raw title sample (for platform_label):`, JSON.stringify(pageTitles[0]).slice(0, 800));
    } else if (pageCount === 1) {
      platformDebugs.push(debugInfo);
    }

    for (const raw of pageTitles) {
      allTitles.push({
        ...raw,
        _sourcePlatform: platform.name,
        _sourceContractVersion: platform.version,
      });
    }
    platformTitlesCount += pageTitles.length;

    // Check for continuation token (can be in different locations)
    // Xbox API might use different field names - check common variations
    // Also check response headers
    // Try all possible field name variations
    const possibleTokens = [
      headerContinuationToken,
      json?.pagingInfo?.continuationToken,
      json?.pagingInfo?.continuation_token,
      json?.pagingInfo?.continuation,
      json?.pagingInfo?.token,
      json?.pagingInfo?.nextToken,
      json?.pagingInfo?.next_token,
      json?.continuationToken,
      json?.continuation_token,
      json?.continuation,
      json?.token,
      json?.nextToken,
      json?.next_token,
    ].filter(Boolean);
    
    continuationToken = possibleTokens[0] ?? null;
    
    // Also check if pagingInfo has any string values that might be tokens
    if (!continuationToken && json?.pagingInfo) {
      const pagingInfo = json.pagingInfo;
      for (const key in pagingInfo) {
        const value = pagingInfo[key];
        if (typeof value === 'string' && value.length > 10) {
          // Might be a continuation token
          continuationToken = value;
          console.log(`[Xbox] Found potential continuation token in pagingInfo.${key}: ${value.substring(0, 50)}...`);
          break;
        }
      }
    }

    // Log pagination progress
    console.log(`[Xbox ${platform.name}] Page ${pageCount}: ${pageTitles.length} titles (platform total: ${platformTitlesCount}, all platforms: ${allTitles.length})`);
    if (continuationToken) {
      console.log(`[Xbox ${platform.name}] Found continuation token: ${continuationToken.substring(0, 50)}..., fetching next page...`);
    } else {
      console.log(`[Xbox ${platform.name}] No continuation token found. Full pagingInfo:`, JSON.stringify(json?.pagingInfo, null, 2));
      if (json?.pagingInfo) {
        console.log(`[Xbox ${platform.name}] pagingInfo contents:`, JSON.stringify(json.pagingInfo, null, 2));
      }
    }
    } while (continuationToken);
    
    console.log(`[Xbox ${platform.name}] Finished: ${platformTitlesCount} titles from this platform`);
    } catch (e: any) {
      console.error(`[Xbox ${platform.name}] Error fetching titles:`, e?.message || e);
      // Continue to next platform
    }
  } // End platform loop

  console.log(`[Xbox] Finished fetching: ${allTitles.length} total titles across all platforms`);

  return {
    ok: true as const,
    titles: allTitles,
    debug: {
      totalTitles: allTitles.length,
      platformDebugs: platformDebugs,
      firstPageDebug: platformDebugs[0] || null,
    },
  };
}

export async function GET() {
  // Must be logged in to your app
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const user = userRes.user;

  // Get stored xbox_access_token
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("xbox_access_token")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const accessToken = String(profile?.xbox_access_token ?? "").trim();
  if (!accessToken) {
    return NextResponse.json({ error: "Xbox not connected (missing access token)" }, { status: 400 });
  }

  // XBL + XSTS handshake
  const xbl = await xblAuthenticate(accessToken);
  if (!xbl.ok) return NextResponse.json({ error: xbl.error, detail: xbl.detail }, { status: 500 });

  const xsts = await xstsAuthorize(xbl.token);
  if (!xsts.ok) return NextResponse.json({ error: xsts.error, detail: xsts.detail }, { status: 500 });

  if (!xsts.uhs || !xsts.token) {
    return NextResponse.json({ error: "XSTS missing uhs/token" }, { status: 500 });
  }

  const authorization = xblAuthHeader(xsts.uhs, xsts.token);

  // Profile -> xuid + gamertag
  const prof = await fetchProfile(authorization);
  if (!prof.ok) return NextResponse.json({ error: prof.error, detail: prof.detail }, { status: 500 });

  const xuid = String(prof.xuid ?? "").trim();
  const gamertag = prof.gamertag ?? null;

  if (!xuid) {
    return NextResponse.json({ error: "Could not determine XUID from profile" }, { status: 500 });
  }

  // Achievements per title
  const hist = await fetchAchievementHistoryTitles(authorization, xuid);
  // Note: fetchAchievementHistoryTitles now always returns ok: true (errors are logged but don't fail)

  // Log raw response for debugging
  console.log(`[Xbox Titles API] Raw titles count: ${hist.titles.length}`);
  console.log(`[Xbox Titles API] Fetch debug:`, hist.debug);
  if (hist.titles.length > 0) {
    console.log(`[Xbox Titles API] First title sample:`, JSON.stringify(hist.titles[0]).slice(0, 500));
  }

  // Normalize titles for sync route
  const titles: TitleOut[] = (hist.titles as any[]).map((t) => {
    const titleName = t?.name ?? t?.titleName ?? "Unknown";

    const titleId = t?.titleId != null ? String(t.titleId) : undefined;

    const achievementsEarned =
      Number(
        t?.achievement?.currentAchievements ??
        t?.currentAchievements ??
        t?.earnedAchievements ??
        t?.achievement?.earnedAchievements ??
        0
      );

    const achievementsTotal =
      Number(
        t?.achievement?.totalAchievements ??
        t?.totalAchievements ??
        t?.availableAchievements ??
        t?.achievement?.availableAchievements ??
        0
      );

    const gamerscoreEarned =
      Number(
        t?.achievement?.currentGamerscore ??
        t?.currentGamerscore ??
        t?.earnedGamerscore ??
        t?.achievement?.earnedGamerscore ??
        0
      );

    const gamerscoreTotal =
      Number(
        t?.achievement?.totalGamerscore ??
        t?.totalGamerscore ??
        t?.maxGamerscore ??
        t?.possibleGamerscore ??
        t?.achievement?.maxGamerscore ??
        t?.achievement?.possibleGamerscore ??
        0
      );

    // last time played can show up in different fields depending on response shape
    const lastPlayedAt =
      isoOrNull(t?.lastTimePlayed) ??
      isoOrNull(t?.lastPlayed) ??
      isoOrNull(t?.lastUnlockTime) ??
      null;

    return {
      name: String(titleName),
      titleId,
      pfTitleId: titleId, // keep compatibility with your earlier model
      devices: Array.isArray(t?.devices) ? t.devices : undefined,
      platform_label: xboxPlatformLabelFromRaw(t),
      achievements_earned: achievementsEarned,
      achievements_total: achievementsTotal,
      gamerscore_earned: gamerscoreEarned,
      gamerscore_total: gamerscoreTotal,
      last_played_at: lastPlayedAt,
    };
  });

  return NextResponse.json({
    ok: true,
    xuid,
    gamertag,
    gamerscore: null, // optional aggregate; you can compute later
    titles,
    debug: {
      totalTitles: titles.length,
      titlesWithAchievements: titles.filter((t) => (t.achievements_total ?? 0) > 0).length,
      titlesWithGamerscore: titles.filter((t) => (t.gamerscore_total ?? 0) > 0).length,
      rawTitlesCount: hist.titles.length,
      titleNames: titles.map((t) => t.name).slice(0, 10), // First 10 for debugging
      platformLabelCounts: {
        "Xbox 360": titles.filter((t) => t.platform_label === "Xbox 360").length,
        "Xbox One": titles.filter((t) => t.platform_label === "Xbox One").length,
        "Xbox Series": titles.filter((t) => t.platform_label === "Xbox Series").length,
      },
      fetchDebug: hist.debug, // Include pagination debug info (includes rawTitleSample per platform)
    },
  });
}
