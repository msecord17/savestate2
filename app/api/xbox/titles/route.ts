import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type TitleOut = {
  name: string;
  titleId?: string;
  pfTitleId?: string;
  devices?: string[];
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
async function fetchAchievementHistoryTitles(authorization: string, xuid: string) {
  // This endpoint returns per-title achievement + gamerscore totals.
  // maxItems can be big; 500 covers most people.
  const url = `https://achievements.xboxlive.com/users/xuid(${encodeURIComponent(
    xuid
  )})/history/titles?maxItems=500`;

  const res = await fetch(url, {
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
      error: `Achievements history/titles failed (${res.status})`,
      detail: json ?? text,
    };
  }

  // Typically json.titles is the list
  const titles = Array.isArray(json?.titles) ? json.titles : [];
  return { ok: true as const, titles };
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
  if (!hist.ok) return NextResponse.json({ error: hist.error, detail: hist.detail }, { status: 500 });

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
  });
}
