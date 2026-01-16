import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type XboxTitle = {
  name: string;
  titleId?: string;
  pfTitleId?: string;
  devices?: string[];
};

async function refreshXboxTokenIfNeeded(supabase: any, userId: string, origin: string) {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("xbox_access_token, xbox_refresh_token, xbox_access_token_expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const accessToken = String(profile?.xbox_access_token ?? "");
  const refreshToken = String(profile?.xbox_refresh_token ?? "");
  const expiresAt = profile?.xbox_access_token_expires_at
    ? new Date(profile.xbox_access_token_expires_at).getTime()
    : 0;

  if (!accessToken) throw new Error("Missing xbox_access_token (connect Xbox first).");

  const now = Date.now();
  const isExpiredSoon = expiresAt && expiresAt < now + 60_000;

  if (!isExpiredSoon) return { accessToken, refreshed: false };

  if (!refreshToken) return { accessToken, refreshed: false };

  const clientId = process.env.XBOX_CLIENT_ID!;
  const clientSecret = process.env.XBOX_CLIENT_SECRET!;
  const redirectUri = process.env.XBOX_REDIRECT_URI || `${origin}/api/auth/xbox/callback`;

  const tokenRes = await fetch("https://login.live.com/oauth20_token.srf", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      redirect_uri: redirectUri,
    }).toString(),
  });

  const tokenText = await tokenRes.text();
  let tokenJson: any = null;
  try {
    tokenJson = tokenText ? JSON.parse(tokenText) : null;
  } catch {
    tokenJson = null;
  }

  if (!tokenRes.ok || !tokenJson?.access_token) {
    throw new Error(`Failed to refresh Xbox token: ${tokenText}`);
  }

  const newAccess = String(tokenJson.access_token);
  const newRefresh = String(tokenJson.refresh_token || refreshToken);
  const expiresIn = Number(tokenJson.expires_in || 3600);
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  const { error: upErr } = await supabase
    .from("profiles")
    .update({
      xbox_access_token: newAccess,
      xbox_refresh_token: newRefresh || null,
      xbox_access_token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  if (upErr) throw new Error(upErr.message);

  return { accessToken: newAccess, refreshed: true };
}

async function xblUserAuthenticate(accessToken: string) {
  const res = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-xbl-contract-version": "1",
      "Accept-Language": "en-US", // override weird wildcard values
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
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.Token) {
    throw new Error(`XBL user.authenticate failed (${res.status}): ${text || ""}`);
  }

  const uhs = json?.DisplayClaims?.xui?.[0]?.uhs;
  if (!uhs) throw new Error("XBL auth succeeded but uhs missing in response.");

  return { xblToken: json.Token as string, uhs: String(uhs) };
}

async function xstsAuthorize(xblToken: string) {
  const res = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept-Language": "en-US",
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
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json?.Token) {
    throw new Error(`XSTS authorize failed (${res.status}): ${text || ""}`);
  }

  const xuid = json?.DisplayClaims?.xui?.[0]?.xid ? String(json.DisplayClaims.xui[0].xid) : null;
  const gamertag = json?.DisplayClaims?.xui?.[0]?.gt ? String(json.DisplayClaims.xui[0].gt) : null;

  if (!xuid) throw new Error("XSTS succeeded but xuid missing.");

  return { xstsToken: json.Token as string, xuid, gamertag };
}

async function fetchXboxTitles(uhs: string, xstsToken: string, xuid: string): Promise<XboxTitle[]> {
  const auth = `XBL3.0 x=${uhs};${xstsToken}`;

  // FIX #1: include XUID in the URL (TitleHub demands it)
  const url = `https://titlehub.xboxlive.com/users/xuid(${encodeURIComponent(xuid)})/titles/titlehistory/decoration/detail`;

  const res = await fetch(url, {
    headers: {
      Authorization: auth,
      "x-xbl-contract-version": "2",
      "Accept-Language": "en-US", // FIX #2: override wildcard "*"
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

  if (!res.ok) {
    throw new Error(`TitleHub failed (${res.status}): ${text || ""}`);
  }

  const titles = Array.isArray(json?.titles)
    ? json.titles
    : Array.isArray(json?.Titles)
      ? json.Titles
      : [];

  return titles.map((t: any) => ({
    name: t?.name || t?.Name || "Unknown title",
    titleId: t?.titleId ? String(t.titleId) : t?.TitleId ? String(t.TitleId) : undefined,
    pfTitleId: t?.pfTitleId ? String(t.pfTitleId) : t?.PFTitleId ? String(t.PFTitleId) : undefined,
    devices: Array.isArray(t?.devices) ? t.devices : Array.isArray(t?.Devices) ? t.Devices : undefined,
  }));
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRouteClient();
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

    const user = userRes.user;
    const origin = new URL(req.url).origin;

    const { accessToken } = await refreshXboxTokenIfNeeded(supabase, user.id, origin);

    const { xblToken, uhs } = await xblUserAuthenticate(accessToken);
    const { xstsToken, xuid, gamertag } = await xstsAuthorize(xblToken);

    // Save xuid/gamertag for UI and later sync steps (non-fatal if fails)
    await supabase
      .from("profiles")
      .update({
        xbox_xuid: xuid,
        xbox_gamertag: gamertag,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    const titles = await fetchXboxTitles(uhs, xstsToken, xuid);

    return NextResponse.json({
      ok: true,
      xuid,
      gamertag,
      titles,
      total: titles.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Xbox titles failed" }, { status: 500 });
  }
}
