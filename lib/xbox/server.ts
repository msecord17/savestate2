// web/lib/xbox/server.ts
import { supabaseRouteClient } from "@/lib/supabase/route-client";

/**
 * Xbox API authentication helpers
 */

// 1) XBL user.authenticate
export async function xblAuthenticate(accessToken: string) {
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
        RpsTicket: `d=${accessToken}`,
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    }),
  });

  const text = await res.text();
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(`XBL user.authenticate failed (${res.status}): ${json?.error || text}`);
  }

  return json?.Token as string;
}

// 2) XSTS authorize
export async function xstsAuthorize(xblToken: string) {
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
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(`XSTS authorize failed (${res.status}): ${json?.error || text}`);
  }

  const xstsToken = json?.Token as string;
  const uhs = json?.DisplayClaims?.xui?.[0]?.uhs as string | undefined;

  if (!xstsToken || !uhs) {
    throw new Error("XSTS missing token or uhs");
  }

  return { token: xstsToken, uhs };
}

// Helper: common XBL Authorization header format
export function xblAuthHeader(uhs: string, xstsToken: string) {
  return `XBL3.0 x=${uhs};${xstsToken}`;
}

// 3) Profile: get xuid + gamertag
export async function fetchXboxProfile(authorization: string) {
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
  const json = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(`Profile failed (${res.status}): ${json?.error || text}`);
  }

  const xuid = json?.profileUsers?.[0]?.id ?? null;
  const settings = json?.profileUsers?.[0]?.settings ?? [];
  const gamertag =
    settings.find((s: any) => s?.id === "Gamertag")?.value ??
    settings.find((s: any) => s?.id === "GameDisplayName")?.value ??
    null;

  if (!xuid) {
    throw new Error("Could not determine XUID from profile");
  }

  return { xuid, gamertag };
}

/**
 * Fetch individual achievements for a specific Xbox title
 * Tries both contract versions (1 for Xbox 360, 2 for Xbox One/Series)
 */
export async function fetchXboxAchievementsForTitle(
  authorization: string,
  xuid: string,
  titleId: string
) {
  const url = `https://achievements.xboxlive.com/users/xuid(${encodeURIComponent(
    xuid
  )})/achievements?titleId=${encodeURIComponent(titleId)}`;

  // Try Xbox One/Series first (version 2), then Xbox 360 (version 1)
  const versions = ["2", "1"];
  
  for (const version of versions) {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authorization,
        "x-xbl-contract-version": version,
        "Accept-Language": "en-US",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // Invalid JSON, continue to next version
    }

    if (res.ok && json) {
      // The API returns achievements in json.achievements array
      const achievements = Array.isArray(json?.achievements) ? json.achievements : [];
      if (achievements.length > 0 || version === "1") {
        // If we got results, or we're on the last version, return what we have
        return achievements;
      }
      // If version 2 returned empty, try version 1
      continue;
    }

    // If version 2 failed with 404 or similar, try version 1
    if (res.status === 404 && version === "2") {
      continue;
    }

    // For other errors on version 2, try version 1
    if (version === "2") {
      continue;
    }
  }

  // If both versions failed, throw error
  throw new Error(`Xbox achievements fetch failed for titleId ${titleId} (tried both contract versions 1 and 2)`);
}

/**
 * Get Xbox authorization from stored access token
 */
export async function getXboxAuthorization(accessToken: string) {
  const xblToken = await xblAuthenticate(accessToken);
  const xsts = await xstsAuthorize(xblToken);
  return xblAuthHeader(xsts.uhs, xsts.token);
}
