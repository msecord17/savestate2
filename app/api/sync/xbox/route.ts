import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type XboxTitleRow = {
  titleId: number;
  name: string;
  lastTimePlayed?: string; // ISO-ish
  minutesPlayed?: number;  // sometimes present, sometimes not
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function slugPlatformKey() {
  return "xbox";
}

/**
 * Microsoft OAuth refresh (for user access tokens)
 */
async function refreshMicrosoftToken(opts: {
  tenant: string; // usually "consumers" or "common"
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  redirectUri: string;
}) {
  const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(
    opts.tenant
  )}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    grant_type: "refresh_token",
    refresh_token: opts.refreshToken,
    redirect_uri: opts.redirectUri,
    scope: "XboxLive.signin offline_access",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `MS refresh failed (${res.status}): ${JSON.stringify(json)}`
    );
  }

  return {
    access_token: String(json?.access_token || ""),
    refresh_token: String(json?.refresh_token || opts.refreshToken),
    expires_in: Number(json?.expires_in || 3600),
  };
}

/**
 * Exchange Microsoft OAuth access token -> Xbox User token + XSTS token
 */
async function getXstsFromMicrosoftAccessToken(msAccessToken: string) {
  // 1) user token (XBL) using RPS ticket "d=<ms_access_token>"
  const userAuthRes = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${msAccessToken}`,
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    }),
    cache: "no-store",
  });

  const userAuthJson = await userAuthRes.json().catch(() => null);
  if (!userAuthRes.ok) {
    throw new Error(
      `XBL user token failed (${userAuthRes.status}): ${JSON.stringify(userAuthJson)}`
    );
  }

  const userToken = String(userAuthJson?.Token || "");
  const uhs = String(userAuthJson?.DisplayClaims?.xui?.[0]?.uhs || "");
  if (!userToken || !uhs) {
    throw new Error("XBL user token missing Token/uhs");
  }

  // 2) XSTS token
  const xstsRes = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      Properties: {
        SandboxId: "RETAIL",
        UserTokens: [userToken],
      },
      RelyingParty: "http://xboxlive.com",
      TokenType: "JWT",
    }),
    cache: "no-store",
  });

  const xstsJson = await xstsRes.json().catch(() => null);
  if (!xstsRes.ok) {
    throw new Error(
      `XSTS failed (${xstsRes.status}): ${JSON.stringify(xstsJson)}`
    );
  }

  const xstsToken = String(xstsJson?.Token || "");
  const xuid = String(xstsJson?.DisplayClaims?.xui?.[0]?.xid || "");
  if (!xstsToken || !xuid) {
    throw new Error("XSTS missing Token/xuid");
  }

  // Authorization header format used by Xbox endpoints:
  // XBL3.0 x=<uhs>;<xstsToken>
  const xblAuth = `XBL3.0 x=${uhs};${xstsToken}`;

  return { xblAuth, xuid };
}

/**
 * Fetch “title history” (recent titles played).
 * This endpoint commonly works for “recently played”.
 * Playtime minutes availability varies by title/account.
 */
async function fetchXboxTitleHistory(xblAuth: string, xuid: string): Promise<XboxTitleRow[]> {
  const url =
    `https://titlehub.xboxlive.com/users/xuid(${encodeURIComponent(
      xuid
    )})/titles/titlehistory/decoration/detail`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: xblAuth,
      "x-xbl-contract-version": "2",
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `Title history failed (${res.status}): ${JSON.stringify(json)}`
    );
  }

  const titles = Array.isArray(json?.titles) ? json.titles : [];
  // Normalize minimal fields
  return titles
    .map((t: any) => {
      const titleId = Number(t?.titleId || 0);
      const name = String(t?.name || "").trim();
      if (!titleId || !name) return null;

      // Some payloads include titleHistory object; fields vary.
      const lastTimePlayed =
        t?.titleHistory?.lastTimePlayed ||
        t?.titleHistory?.lastTimePlayedUtc ||
        t?.titleHistory?.lastPlayed ||
        null;

      // Some payloads include minutesPlayed (rare) or stats-like fields.
      const minutesPlayed =
        typeof t?.titleHistory?.minutesPlayed === "number"
          ? t.titleHistory.minutesPlayed
          : (typeof t?.titleHistory?.totalMinutesPlayed === "number"
              ? t.titleHistory.totalMinutesPlayed
              : null);

      return {
        titleId,
        name,
        lastTimePlayed: lastTimePlayed ? String(lastTimePlayed) : undefined,
        minutesPlayed: minutesPlayed != null ? Number(minutesPlayed) : undefined,
      } as XboxTitleRow;
    })
    .filter(Boolean);
}

/**
 * Catalog helpers: reuse existing games/releases when possible.
 */
async function getOrCreateGameAndRelease(opts: {
  supabaseAdmin: any;
  title: string;
  xboxTitleId: number;
}) {
  const { supabaseAdmin, title, xboxTitleId } = opts;

  // A) See if release already exists by xbox_title_id
  const { data: existingRelease } = await supabaseAdmin
    .from("releases")
    .select("id, game_id")
    .eq("xbox_title_id", xboxTitleId)
    .maybeSingle();

  if (existingRelease?.id && existingRelease?.game_id) {
    return { releaseId: existingRelease.id as string, gameId: existingRelease.game_id as string, created: false };
  }

  // B) Find game by canonical_title (you have a UNIQUE constraint here)
  let gameId: string | null = null;

  const { data: existingGame } = await supabaseAdmin
    .from("games")
    .select("id")
    .eq("canonical_title", title)
    .maybeSingle();

  if (existingGame?.id) {
    gameId = existingGame.id;
  } else {
    const { data: newGame, error: gErr } = await supabaseAdmin
      .from("games")
      .insert({ canonical_title: title })
      .select("id")
      .single();

    if (gErr || !newGame?.id) {
      throw new Error(`Failed to insert game for ${title}: ${gErr?.message || "unknown"}`);
    }
    gameId = newGame.id;
  }

  // C) Create release
  const { data: newRelease, error: rErr } = await supabaseAdmin
    .from("releases")
    .insert({
      game_id: gameId,
      display_title: title,
      platform_name: "Xbox",
      platform_key: slugPlatformKey(),
      xbox_title_id: xboxTitleId, // requires this column in releases (see note below)
    })
    .select("id")
    .single();

  if (rErr || !newRelease?.id) {
    throw new Error(`Failed to insert release for ${title}: ${rErr?.message || "unknown"}`);
  }

  return { releaseId: newRelease.id as string, gameId: gameId as string, created: true };
}

export async function POST(req: Request) {
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // Pull Xbox tokens from profiles
    const { data: profile, error: pErr } = await supabaseUser
      .from("profiles")
      .select(
        "xbox_access_token, xbox_refresh_token, xbox_token_expires_at"
      )
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    let accessToken = String(profile?.xbox_access_token || "");
    const refreshToken = String(profile?.xbox_refresh_token || "");
    const expiresAt = profile?.xbox_token_expires_at ? new Date(profile.xbox_token_expires_at).getTime() : 0;

    if (!accessToken) {
      return NextResponse.json({ error: "Xbox not connected (missing access token)" }, { status: 400 });
    }

    // If expired or expiring soon, refresh
    const now = Date.now();
    const isExpired = expiresAt && now > (expiresAt - 60_000); // 1 min grace
    if (isExpired) {
      const clientId = process.env.XBOX_CLIENT_ID || "";
      const clientSecret = process.env.XBOX_CLIENT_SECRET || "";
      const redirectUri = process.env.XBOX_REDIRECT_URI || "";

      if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
        return NextResponse.json(
          { error: "Missing Xbox refresh config (client id/secret/redirect/refresh token)" },
          { status: 500 }
        );
      }

      const tenant = process.env.XBOX_TENANT || "consumers";
      const refreshed = await refreshMicrosoftToken({
        tenant,
        clientId,
        clientSecret,
        refreshToken,
        redirectUri,
      });

      accessToken = refreshed.access_token;

      // Save refreshed tokens
      const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
      await supabaseUser
        .from("profiles")
        .update({
          xbox_access_token: refreshed.access_token,
          xbox_refresh_token: refreshed.refresh_token,
          xbox_token_expires_at: newExpiresAt,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }

    // 1) Convert MS OAuth token -> XSTS + XUID
    const { xblAuth, xuid } = await getXstsFromMicrosoftAccessToken(accessToken);

    // 2) Fetch title history
    const titles = await fetchXboxTitleHistory(xblAuth, xuid);

    // 3) Admin client (catalog writes)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let imported = 0;
    let updated = 0;

    // 4) Process titles
    for (const t of titles) {
      const title = (t.name || "").trim();
      const xboxTitleId = Number(t.titleId || 0);
      if (!title || !xboxTitleId) continue;

      // A) Ensure catalog rows exist
      const { releaseId, created } = await getOrCreateGameAndRelease({
        supabaseAdmin,
        title,
        xboxTitleId,
      });

      if (created) imported += 1;
      else updated += 1;

      // B) Upsert xbox_title_progress
      const minutesPlayed =
        t.minutesPlayed != null ? clamp(Number(t.minutesPlayed), 0, 10_000_000) : null;

      const lastPlayed =
        t.lastTimePlayed ? new Date(t.lastTimePlayed).toISOString() : null;

      await supabaseAdmin
        .from("xbox_title_progress")
        .upsert(
          {
            user_id: user.id,
            xbox_title_id: String(xboxTitleId),
            title_name: title,
            title_platform: "Xbox",
            minutes_played: minutesPlayed,
            last_played_at: lastPlayed,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,xbox_title_id" }
        );

      // C) Upsert into portfolio_entries (do NOT stomp user choices)
      const { data: existingEntry, error: exErr } = await supabaseUser
        .from("portfolio_entries")
        .select("status, playtime_minutes, last_played_at")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (exErr) {
        return NextResponse.json(
          { error: `Failed to check portfolio entry for ${title}: ${exErr.message}` },
          { status: 500 }
        );
      }

      const incomingPlaytimeMinutes =
        minutesPlayed != null ? minutesPlayed : 0;

      const incomingLastPlayed =
        lastPlayed ? lastPlayed : null;

      if (!existingEntry) {
        const { error: insErr } = await supabaseUser
          .from("portfolio_entries")
          .insert({
            user_id: user.id,
            release_id: releaseId,
            status: "owned",
            playtime_minutes: incomingPlaytimeMinutes,
            last_played_at: incomingLastPlayed,
            updated_at: new Date().toISOString(),
          });

        if (insErr) {
          return NextResponse.json(
            { error: `Failed to insert portfolio entry for ${title}: ${insErr.message}` },
            { status: 500 }
          );
        }
      } else {
        const currentPlaytime = Number(existingEntry.playtime_minutes || 0);
        const nextPlaytime = Math.max(currentPlaytime, incomingPlaytimeMinutes);

        let nextLastPlayed = existingEntry.last_played_at as string | null;
        if (incomingLastPlayed) {
          if (!nextLastPlayed || new Date(incomingLastPlayed) > new Date(nextLastPlayed)) {
            nextLastPlayed = incomingLastPlayed;
          }
        }

        await supabaseUser
          .from("portfolio_entries")
          .update({
            playtime_minutes: nextPlaytime,
            last_played_at: nextLastPlayed,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", user.id)
          .eq("release_id", releaseId);
      }
    }

    // Stamp profile
    await supabaseUser
      .from("profiles")
      .update({
        xbox_last_synced_at: new Date().toISOString(),
        xbox_last_sync_count: titles.length,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return NextResponse.json({
      ok: true,
      imported,
      updated,
      total: titles.length,
      note:
        "Playtime minutes may be missing for some titles depending on Xbox data availability. We still import titles + last played.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Xbox sync failed" }, { status: 500 });
  }
}
