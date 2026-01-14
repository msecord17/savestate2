import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type XblProfile = {
  gamertag?: string;
  gamerscore?: number;
};

type XblAchievementSummary = {
  // We'll treat this loosely; OpenXBL shapes can vary by endpoint/version.
  titleId?: string | number;
  title_id?: string | number;
  name?: string;
  title?: string;
  achievementsEarned?: number;
  achievementsTotal?: number;
  gamerscoreEarned?: number;
  gamerscoreTotal?: number;
  lastTimePlayed?: string;
  last_played_at?: string;
};

function pickTitleId(t: any) {
  return String(t?.titleId ?? t?.title_id ?? t?.id ?? "").trim();
}
function pickTitleName(t: any) {
  return String(t?.name ?? t?.title ?? t?.titleName ?? "").trim();
}

export async function POST() {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();

  if (!userRes?.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const user = userRes.user;

  const { data: profileRow, error: pErr } = await supabase
    .from("profiles")
    .select("xbox_xbl_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const xblKey = String(profileRow?.xbox_xbl_key ?? "").trim();
  if (!xblKey) {
    return NextResponse.json({ error: "Xbox not connected" }, { status: 400 });
  }

  // 1) Fetch account/profile (for gamerscore / gamertag)
  const accountRes = await fetch("https://xbl.io/api/v2/account", {
    headers: {
      "X-Authorization": xblKey,
      "Accept": "application/json",
    },
    cache: "no-store",
  });

  const accountText = await accountRes.text();
  const accountJson = accountText ? JSON.parse(accountText) : null;

  if (!accountRes.ok) {
    return NextResponse.json(
      { error: `OpenXBL account failed (${accountRes.status})`, detail: accountJson },
      { status: 500 }
    );
  }

  const gamertag =
    accountJson?.profileUsers?.[0]?.settings?.find((s: any) => s?.id === "Gamertag")?.value ||
    accountJson?.gamertag ||
    null;

  const gamerscoreStr =
    accountJson?.profileUsers?.[0]?.settings?.find((s: any) => s?.id === "Gamerscore")?.value ||
    accountJson?.gamerscore ||
    "0";

  const gamerscore = Number(gamerscoreStr || 0) || 0;

  // 2) Fetch achievements summary list
  // OpenXBL exposes an achievements endpoint (v2). :contentReference[oaicite:3]{index=3}
  const achRes = await fetch("https://xbl.io/api/v2/achievements", {
    headers: {
      "X-Authorization": xblKey,
      "Accept": "application/json",
    },
    cache: "no-store",
  });

  const achText = await achRes.text();
  const achJson = achText ? JSON.parse(achText) : null;

  if (!achRes.ok) {
    return NextResponse.json(
      { error: `OpenXBL achievements failed (${achRes.status})`, detail: achJson },
      { status: 500 }
    );
  }

  // Normalize list (OpenXBL sometimes returns {titles:[...]} or [...]
  const titles: XblAchievementSummary[] = Array.isArray(achJson)
    ? achJson
    : Array.isArray(achJson?.titles)
      ? achJson.titles
      : Array.isArray(achJson?.results)
        ? achJson.results
        : [];

  let imported = 0;
  let updated = 0;

  for (const t of titles) {
    const titleId = pickTitleId(t);
    if (!titleId) continue;

    const titleName = pickTitleName(t);

    const patch: any = {
      user_id: user.id,
      title_id: titleId,
      title_name: titleName || null,
      title_platform: "Xbox",
      achievements_earned: Number((t as any)?.achievementsEarned ?? (t as any)?.achievements_earned ?? null),
      achievements_total: Number((t as any)?.achievementsTotal ?? (t as any)?.achievements_total ?? null),
      gamerscore_earned: Number((t as any)?.gamerscoreEarned ?? (t as any)?.gamerscore_earned ?? null),
      gamerscore_total: Number((t as any)?.gamerscoreTotal ?? (t as any)?.gamerscore_total ?? null),
      last_played_at: (t as any)?.lastTimePlayed ?? (t as any)?.last_played_at ?? null,
      last_updated_at: new Date().toISOString(),
    };

    // Upsert row for this title
    const { error: upErr } = await supabase
      .from("xbox_title_progress")
      .upsert(patch, { onConflict: "user_id,title_id" });

    if (upErr) {
      return NextResponse.json({ error: `Upsert failed for ${titleId}: ${upErr.message}` }, { status: 500 });
    }

    imported += 1;
  }

  // Save profile summary
  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      xbox_last_synced_at: new Date().toISOString(),
      xbox_last_sync_count: titles.length,
      xbox_gamerscore: gamerscore,
      xbox_achievement_count: titles.length,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  if (profErr) {
    return NextResponse.json({ error: `Failed updating profile: ${profErr.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    gamertag,
    gamerscore,
    imported,
    updated,
    total_titles: titles.length,
  });
}
