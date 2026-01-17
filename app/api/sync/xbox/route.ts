import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

function slugPlatformKey() {
  return "xbox";
}

function xblAuthHeader(uhs: string, xstsToken: string) {
  return `XBL3.0 x=${uhs};${xstsToken}`;
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

  const xuid = json?.profileUsers?.[0]?.id ?? null;

  const settings = json?.profileUsers?.[0]?.settings ?? [];
  const gamertag =
    settings.find((s: any) => s?.id === "Gamertag")?.value ??
    settings.find((s: any) => s?.id === "GameDisplayName")?.value ??
    null;

  return { ok: true as const, xuid, gamertag };
}

// 4) Achievements history titles
async function fetchAchievementHistoryTitles(authorization: string, xuid: string) {
  const url = `https://achievements.xboxlive.com/users/xuid(${encodeURIComponent(xuid)})/history/titles?maxItems=500`;

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

  const titles = Array.isArray(json?.titles) ? json.titles : [];
  return { ok: true as const, titles };
}

export async function POST(req: Request) {
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // Load stored xbox_access_token
    const { data: profile, error: pErr } = await supabaseUser
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

    const prof = await fetchProfile(authorization);
    if (!prof.ok) return NextResponse.json({ error: prof.error, detail: prof.detail }, { status: 500 });

    const xuid = String(prof.xuid ?? "").trim();
    const gamertag = prof.gamertag ?? null;

    if (!xuid) {
      return NextResponse.json({ error: "Could not determine XUID from profile" }, { status: 500 });
    }

    const hist = await fetchAchievementHistoryTitles(authorization, xuid);
    if (!hist.ok) return NextResponse.json({ error: hist.error, detail: hist.detail }, { status: 500 });

    // Normalize titles (same mapping you already had)
    const titles: TitleOut[] = (hist.titles as any[]).map((t) => {
      const titleName = t?.name ?? t?.titleName ?? "Unknown";
      const titleId = t?.titleId != null ? String(t.titleId) : undefined;

      const achievementsEarned = Number(t?.achievement?.currentAchievements ?? t?.currentAchievements ?? 0);
      const achievementsTotal = Number(t?.achievement?.totalAchievements ?? t?.totalAchievements ?? 0);

      const gamerscoreEarned = Number(t?.achievement?.currentGamerscore ?? t?.currentGamerscore ?? 0);
      const gamerscoreTotal = Number(t?.achievement?.totalGamerscore ?? t?.totalGamerscore ?? 0);

      const lastPlayedAt =
        isoOrNull(t?.lastTimePlayed) ??
        isoOrNull(t?.lastPlayed) ??
        isoOrNull(t?.lastUnlockTime) ??
        null;

      return {
        name: String(titleName),
        titleId,
        pfTitleId: titleId,
        devices: Array.isArray(t?.devices) ? t.devices : undefined,
        achievements_earned: achievementsEarned,
        achievements_total: achievementsTotal,
        gamerscore_earned: gamerscoreEarned,
        gamerscore_total: gamerscoreTotal,
        last_played_at: lastPlayedAt,
      };
    });

    // Admin client for catalog writes
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let imported = 0;
    let updated = 0;

    const progressRows: any[] = [];

    for (const t of titles) {
      const title = String(t.name || "").trim();
      if (!title) continue;

      const titleId = String(t.titleId || t.pfTitleId || "").trim();

      // Find / create release
      let existingRelease: any = null;

      if (titleId) {
        const { data } = await supabaseAdmin
          .from("releases")
          .select("id, game_id")
          .eq("xbox_title_id", titleId)
          .maybeSingle();
        existingRelease = data ?? null;
      }

      if (!existingRelease) {
        const { data } = await supabaseAdmin
          .from("releases")
          .select("id, game_id")
          .eq("platform_key", slugPlatformKey())
          .eq("display_title", title)
          .maybeSingle();
        existingRelease = data ?? null;
      }

      let releaseId: string | null = existingRelease?.id ?? null;

      if (!releaseId) {
        const { data: gameRow, error: gErr } = await supabaseAdmin
          .from("games")
          .upsert({ canonical_title: title }, { onConflict: "canonical_title" })
          .select("id")
          .single();

        if (gErr || !gameRow?.id) {
          return NextResponse.json(
            { error: `Failed to upsert game for ${title}: ${gErr?.message || "unknown"}` },
            { status: 500 }
          );
        }

        const releaseInsert: any = {
          game_id: gameRow.id,
          display_title: title,
          platform_name: "Xbox",
          platform_key: slugPlatformKey(),
          cover_url: null,
        };
        if (titleId) releaseInsert.xbox_title_id = titleId;

        const { data: newRelease, error: rErr } = await supabaseAdmin
          .from("releases")
          .insert(releaseInsert)
          .select("id")
          .single();

        if (rErr || !newRelease?.id) {
          return NextResponse.json(
            { error: `Failed to insert release for ${title}: ${rErr?.message || "unknown"}` },
            { status: 500 }
          );
        }

        releaseId = newRelease.id;
        imported += 1;
      } else {
        updated += 1;
      }

      // portfolio entry (non-destructive)
      const { data: existingEntry } = await supabaseUser
        .from("portfolio_entries")
        .select("user_id, release_id")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (!existingEntry) {
        await supabaseUser.from("portfolio_entries").insert({
          user_id: user.id,
          release_id: releaseId,
          status: "owned",
          updated_at: new Date().toISOString(),
        });
      }

      // xbox_title_progress row
      progressRows.push({
        user_id: user.id,
        title_id: titleId || title,
        title_name: title,
        title_platform: "Xbox",
        achievements_earned: Number(t.achievements_earned ?? 0),
        achievements_total: Number(t.achievements_total ?? 0),
        gamerscore_earned: Number(t.gamerscore_earned ?? 0),
        gamerscore_total: Number(t.gamerscore_total ?? 0),
        last_played_at: t.last_played_at ?? null,
        last_updated_at: new Date().toISOString(),
        release_id: releaseId,
      });
    }

    // Write xbox_title_progress
    if (progressRows.length > 0) {
      const { error: upErr } = await supabaseUser
        .from("xbox_title_progress")
        .upsert(progressRows, { onConflict: "user_id,title_id" });

      if (upErr) {
        // If you don’t have that constraint, fallback to delete+insert
        await supabaseUser.from("xbox_title_progress").delete().eq("user_id", user.id);

        const { error: insErr2 } = await supabaseUser.from("xbox_title_progress").insert(progressRows);
        if (insErr2) {
          return NextResponse.json(
            { error: `Failed to insert xbox_title_progress: ${insErr2.message}` },
            { status: 500 }
          );
        }
      }
    }

    // Stamp profile
    await supabaseUser
      .from("profiles")
      .update({
        xbox_xbl_key: xuid ?? null, // keep your existing column name
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
      xuid,
      gamertag,
      progress_rows_written: progressRows.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Xbox sync failed" }, { status: 500 });
  }
}
