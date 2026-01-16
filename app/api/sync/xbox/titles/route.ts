import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type XblUserAuthResponse = {
  Token: string;
  DisplayClaims: { xui: Array<{ uhs: string }> };
};

type XstsAuthResponse = {
  Token: string;
  DisplayClaims: { xui: Array<{ uhs: string; xuid?: string }> };
};

function toXblAuthHeader(uhs: string, xstsToken: string) {
  return `XBL3.0 x=${uhs};${xstsToken}`;
}

async function xboxUserAuthenticate(msAccessToken: string): Promise<{ userToken: string; uhs: string }> {
  const res = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        // This is the standard way to pass a Microsoft OAuth access token to XBL:
        RpsTicket: `d=${msAccessToken}`,
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    }),
  });

  const text = await res.text();
  const data: XblUserAuthResponse | null = text ? JSON.parse(text) : null;

  if (!res.ok || !data?.Token || !data?.DisplayClaims?.xui?.[0]?.uhs) {
    throw new Error(`XBL user.authenticate failed (${res.status}): ${text}`);
  }

  return { userToken: data.Token, uhs: data.DisplayClaims.xui[0].uhs };
}

async function xboxXstsAuthorize(userToken: string): Promise<{ xstsToken: string; uhs: string; xuid: string | null }> {
  // For game/title endpoints we typically use relying party "http://xboxlive.com"
  const res = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      Properties: {
        SandboxId: "RETAIL",
        UserTokens: [userToken],
      },
      RelyingParty: "http://xboxlive.com",
      TokenType: "JWT",
    }),
  });

  const text = await res.text();
  const data: XstsAuthResponse | null = text ? JSON.parse(text) : null;

  const uhs = data?.DisplayClaims?.xui?.[0]?.uhs;
  const xuid = data?.DisplayClaims?.xui?.[0]?.xuid ?? null;

  if (!res.ok || !data?.Token || !uhs) {
    throw new Error(`XSTS authorize failed (${res.status}): ${text}`);
  }

  return { xstsToken: data.Token, uhs, xuid };
}

async function fetchProfile(authorization: string, xuid: string | null) {
  // If xuid is missing, we can still call /users/me, but many endpoints want xuid.
  const who = xuid ? `xuid(${xuid})` : "me";

  const res = await fetch(
    `https://profile.xboxlive.com/users/${who}/profile/settings?settings=Gamertag,Gamerscore`,
    {
      headers: {
        Authorization: authorization,
        "x-xbl-contract-version": "2",
        Accept: "application/json",
      },
      cache: "no-store",
    }
  );

  const text = await res.text();
  const j = text ? JSON.parse(text) : null;

  // Shape varies; we parse defensively:
  const settings = j?.profileUsers?.[0]?.settings ?? [];
  const gamertag = settings.find((s: any) => s?.id === "Gamertag")?.value ?? null;
  const gamerscoreStr = settings.find((s: any) => s?.id === "Gamerscore")?.value ?? null;
  const gamerscore = gamerscoreStr ? Number(gamerscoreStr) : null;

  return { gamertag, gamerscore };
}

async function fetchTitleHistory(authorization: string, xuid: string) {
  // TitleHub title history endpoint
  // Returns titles played. We’ll normalize to { name, titleId/pfTitleId, devices }
  const url =
    `https://titlehub.xboxlive.com/users/xuid(${encodeURIComponent(xuid)})/titles/titlehistory/decoration/achievement,image,scid,stats` +
    `?maxItems=200`;

  const res = await fetch(url, {
    headers: {
      Authorization: authorization,
      "x-xbl-contract-version": "2",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const text = await res.text();
  const j = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(`TitleHub titlehistory failed (${res.status}): ${text}`);
  }

  const arr = Array.isArray(j?.titles) ? j.titles : [];

  // Normalize titles
  const titles = arr
    .map((t: any) => {
      const name = t?.name ?? t?.titleName ?? null;
      const titleId = t?.titleId ?? null;
      const pfTitleId = t?.pfn ?? t?.pfTitleId ?? null; // varies
      const devices = Array.isArray(t?.devices) ? t.devices : [];

      if (!name) return null;

      return {
        name: String(name),
        titleId: titleId ? String(titleId) : undefined,
        pfTitleId: pfTitleId ? String(pfTitleId) : undefined,
        devices,
      };
    })
    .filter(Boolean);

  return titles;
}

export async function GET() {
  try {
    const supabase = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const user = userRes.user;

    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("xbox_access_token, xbox_refresh_token, xbox_connected_at, xbox_xbl_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const msAccessToken = String(profile?.xbox_access_token || "").trim();
    if (!msAccessToken) {
      return NextResponse.json({ error: "Missing xbox_access_token on profile" }, { status: 400 });
    }

    // 1) Microsoft OAuth token -> XBL user token
    const { userToken } = await xboxUserAuthenticate(msAccessToken);

    // 2) XBL user token -> XSTS token (+ xuid)
    const { xstsToken, uhs, xuid } = await xboxXstsAuthorize(userToken);

    if (!xuid) {
      return NextResponse.json(
        {
          error: "XUID not returned by XSTS. This can happen if the account lacks Xbox profile setup.",
        },
        { status: 500 }
      );
    }

    const auth = toXblAuthHeader(uhs, xstsToken);

    // 3) Profile (gamertag + gamerscore)
    const { gamertag, gamerscore } = await fetchProfile(auth, xuid);

    // 4) Title history
    const titles = await fetchTitleHistory(auth, xuid);

    // Optional: store some resolved fields so profile UI can show “real Xbox stats”
    // We re-use xbox_xbl_key as “xuid” in your schema.
    await supabase
      .from("profiles")
      .update({
        xbox_xbl_key: xuid, // store XUID here
        xbox_gamerscore: gamerscore ?? null,
        // If you want achievements later, we’ll fill this in with an extra endpoint
        xbox_achievement_count: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return NextResponse.json({
      ok: true,
      xuid,
      gamertag,
      gamerscore,
      titles,
      total: titles.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Xbox titles failed" }, { status: 500 });
  }
}
