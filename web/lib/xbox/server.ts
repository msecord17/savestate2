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
  const base = `https://achievements.xboxlive.com/users/xuid(${encodeURIComponent(xuid)})/achievements`;

  const idOf = (ach: any) =>
    String(ach?.id ?? ach?.achievementId ?? ach?.achievement_id ?? "").trim();

  const fetchPaged = async (version: string, query: string) => {
    const all: any[] = [];
    let continuationToken: string | null = null;

    for (let guard = 0; guard < 50; guard++) {
      const url = continuationToken
        ? `${base}?${query}&continuationToken=${encodeURIComponent(continuationToken)}`
        : `${base}?${query}`;

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
        json = null;
      }

      if (!res.ok || !json) {
        const snippet = String(text || "").slice(0, 300);
        const err = new Error(
          `Xbox achievements fetch failed (${res.status}) for contract v${version}. ${snippet ? `Body: ${snippet}` : ""}`.trim()
        );
        (err as any).status = res.status;
        throw err;
      }

      const page = Array.isArray(json)
        ? json
        : Array.isArray(json?.achievements)
          ? json.achievements
          : [];

      for (const a of page) all.push(a);

      const next =
        (json?.pagingInfo?.continuationToken ?? json?.continuationToken ?? null) as string | null;
      continuationToken = next && String(next).trim() ? String(next).trim() : null;
      if (!continuationToken) break;
    }

    return all;
  };

  const countUnlockedish = (items: any[]) =>
    items.filter((a) => {
      const unlock = a?.unlockedDateTime ?? a?.unlockTime ?? a?.progression?.timeUnlocked ?? null;
      // Some shapes only have progressState/state flags
      const ps = String(a?.progressState ?? a?.progress_state ?? "").toLowerCase();
      const st = String(a?.state ?? "").toLowerCase();
      const unlockedFlag = ps === "achieved" || ps === "unlocked" || st === "unlocked" || Boolean(a?.isUnlocked) || Boolean(a?.unlocked);
      return Boolean(unlock) || unlockedFlag;
    }).length;

  const seemsEarnedOnly = (items: any[]) => {
    if (!Array.isArray(items) || items.length === 0) return false;
    const unlocked = countUnlockedish(items);
    return unlocked === items.length;
  };

  const includesTitleId = (a: any, tid: string) => {
    // Best-effort: different contracts expose title linkage differently.
    // Common: titleAssociations: [{ id: <titleId>, name: ... }]
    const assoc = a?.titleAssociations ?? a?.title_associations ?? null;
    if (Array.isArray(assoc)) {
      for (const x of assoc) {
        const id = String(x?.id ?? x?.titleId ?? x?.title_id ?? "").trim();
        if (id === tid) return true;
      }
    }
    // Fallback: scan a small subset of fields
    const hint = String(a?.serviceConfigId ?? a?.scid ?? a?.titleId ?? a?.title_id ?? "").trim();
    if (hint === tid) return true;
    return false;
  };

  // Try Xbox One/Series first (version 2), then Xbox 360 (version 1)
  const versions = ["2", "1"];
  let lastErr: any = null;

  for (const version of versions) {
    try {
      // v2 supports paging params reliably. v1 is more finicky across titles, so keep it simple.
      const common = version === "2"
        ? `titleId=${encodeURIComponent(titleId)}&maxItems=100`
        : `titleId=${encodeURIComponent(titleId)}`;

      // 1) Try the simplest "full list" call.
      const allWithProgress = await fetchPaged(version, `${common}&unlockedOnly=false`);

      // If it looks like a full list, take it.
      if (allWithProgress.length > 0 && !seemsEarnedOnly(allWithProgress)) return allWithProgress;

      // For contract v1: don't attempt possibleOnly merge (often unsupported/odd for older titles).
      if (version === "1") {
        // Return whatever we have (even if earned-only) — better than exploding.
        if (allWithProgress.length > 0) return allWithProgress;
        continue;
      }

      // 2) v2 fallback: merge "possible" catalog with "unlocked" set.
      const allPossible = await fetchPaged(version, `${common}&possibleOnly=true`);
      const unlockedOnly = await fetchPaged(version, `${common}&unlockedOnly=true`);

      const unlockedById = new Map<string, any>();
      for (const a of unlockedOnly) {
        const id = idOf(a);
        if (id) unlockedById.set(id, a);
      }

      // Merge unlocked metadata into the possible catalog entries
      const merged = allPossible.map((a) => {
        const id = idOf(a);
        const u = id ? unlockedById.get(id) : null;
        return u ? { ...a, ...u } : a;
      });

      if (merged.length > 0 && !seemsEarnedOnly(merged)) return merged;

      // 3) Last-resort for titles where titleId-filtered calls only return unlocked:
      // Fetch the user's achievements without titleId filter and then filter client-side.
      // This mirrors "PSN-like" behavior without manual selection.
      try {
        const unfiltered = await fetchPaged("2", `maxItems=100&orderBy=Title&unlockedOnly=false`);
        const filtered = unfiltered.filter((a) => includesTitleId(a, String(titleId)));
        if (filtered.length > 0 && !seemsEarnedOnly(filtered)) return filtered;
      } catch {
        // ignore and fall through
      }

      // If v2 still yields earned-only (common for some Xbox 360 titles), try v1 before giving up.
      continue;
    } catch (e: any) {
      lastErr = e;
      const status = Number((e as any)?.status ?? 0);
      if (version === "2" && status === 404) continue; // try v1
      if (version === "2") continue; // try v1 for most errors
    }
  }

  // Prefer surfacing the most specific underlying error (includes status/body snippet)
  if (lastErr) throw lastErr;
  throw new Error(`Xbox achievements fetch failed for titleId ${titleId}`);
}

/**
 * Get Xbox authorization from stored access token
 */
export async function getXboxAuthorization(accessToken: string) {
  const xblToken = await xblAuthenticate(accessToken);
  const xsts = await xstsAuthorize(xblToken);
  return xblAuthHeader(xsts.uhs, xsts.token);
}
