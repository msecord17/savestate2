import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

import {
  getPsnAccessTokenFromNpsso,
  getPsnAccountId,
  getUserPlayedGames,
  getUserTrophyTitlesPaged,
} from "@/lib/psn/server";

/**
 * We must not "lose" titles when Sony doesn't give us a stable id.
 * Strategy:
 * - Prefer a real stable id: npCommunicationId (trophies) or titleId (played)
 * - If missing, generate a deterministic synthetic id from the title name + platform.
 *   (This makes mapping + auto-status still possible.)
 */
function normTitle(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/[™®]/g, "")
    .replace(/\s+/g, " ")
    .replace(/[:\-–—]/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function makeSyntheticId(titleName: string, platform: string) {
  return `synthetic:${platform}:${normTitle(titleName)}`; // deterministic + readable
}

// Parse ISO 8601 duration like "PT228H56M33S" into minutes
function isoDurationToMinutes(v: any): number | null {
  if (!v) return null;
  const duration = String(v);
  const hours = /(\d+)H/.exec(duration)?.[1];
  const mins = /(\d+)M/.exec(duration)?.[1];
  const secs = /(\d+)S/.exec(duration)?.[1];
  const h = hours ? Number(hours) : 0;
  const m = mins ? Number(mins) : 0;
  const s = secs ? Number(secs) : 0;
  const total = h * 60 + m + s / 60;
  if (!isFinite(total) || total <= 0) return 0;
  return Math.round(total);
}

function toIsoOrNow(v: any) {
  if (!v) return new Date().toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Merge-upsert:
 * - We upsert by (user_id, np_communication_id)
 * - We NEVER clobber an existing non-null field with null/undefined
 * - We keep the "max" playtime_minutes (so playtime doesn't go backwards)
 * - We keep last_updated_at as the newer timestamp
 */
async function mergeUpsertPsnTitle(
  supabase: any,
  userId: string,
  key: string,
  patch: {
    title_name?: string | null;
    title_platform?: string | null;
    playtime_minutes?: number | null;
    trophy_progress?: number | null;
    trophies_earned?: number | null;
    trophies_total?: number | null;
    last_updated_at?: string | null;
  }
) {
  const { data: existing, error: exErr } = await supabase
    .from("psn_title_progress")
    .select(
      "user_id, np_communication_id, title_name, title_platform, playtime_minutes, trophy_progress, trophies_earned, trophies_total, last_updated_at"
    )
    .eq("user_id", userId)
    .eq("np_communication_id", key)
    .maybeSingle();

  // If select fails, still try a plain upsert as a fallback.
  if (exErr) {
    const { error: upErr } = await supabase.from("psn_title_progress").upsert(
      {
        user_id: userId,
        np_communication_id: key,
        ...patch,
        last_updated_at: patch.last_updated_at ?? new Date().toISOString(),
      },
      { onConflict: "user_id,np_communication_id" }
    );
    return { ok: !upErr, inserted: !upErr && !existing, updated: !!existing && !upErr, error: upErr?.message };
  }

  const current = existing ?? null;

  const nextPlaytime =
    patch.playtime_minutes == null
      ? current?.playtime_minutes ?? null
      : Math.max(Number(current?.playtime_minutes || 0), Number(patch.playtime_minutes || 0));

  const currentUpdatedAt = current?.last_updated_at ? new Date(current.last_updated_at).getTime() : 0;
  const patchUpdatedAt = patch.last_updated_at ? new Date(patch.last_updated_at).getTime() : 0;
  const nextUpdatedAt =
    patchUpdatedAt >= currentUpdatedAt
      ? (patch.last_updated_at ?? current?.last_updated_at ?? new Date().toISOString())
      : (current?.last_updated_at ?? patch.last_updated_at ?? new Date().toISOString());

  const merged = {
    user_id: userId,
    np_communication_id: key,

    // never clobber with null
    title_name: patch.title_name ?? current?.title_name ?? null,
    title_platform: patch.title_platform ?? current?.title_platform ?? null,

    playtime_minutes: nextPlaytime,

    trophy_progress: patch.trophy_progress ?? current?.trophy_progress ?? null,
    trophies_earned: patch.trophies_earned ?? current?.trophies_earned ?? null,
    trophies_total: patch.trophies_total ?? current?.trophies_total ?? null,

    last_updated_at: nextUpdatedAt,
  };

  if (!current) {
    const { error: insErr } = await supabase.from("psn_title_progress").insert(merged);
    return { ok: !insErr, inserted: !insErr, updated: false, error: insErr?.message };
  } else {
    const { error: updErr } = await supabase
      .from("psn_title_progress")
      .update(merged)
      .eq("user_id", userId)
      .eq("np_communication_id", key);
    return { ok: !updErr, inserted: false, updated: !updErr, error: updErr?.message };
  }
}

export async function POST() {
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // 1) Load NPSSO + cached account id
    const { data: profile, error: pErr } = await supabaseUser
      .from("profiles")
      .select("psn_npsso, psn_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const npsso = String(profile?.psn_npsso ?? "").trim();
    if (!npsso) {
      return NextResponse.json({ error: "PSN not connected (missing NPSSO)" }, { status: 400 });
    }

    // 2) Get PSN access token
    const accessToken = await getPsnAccessTokenFromNpsso(npsso);
    if (!accessToken) {
      return NextResponse.json({ error: "Failed to get PSN access token" }, { status: 500 });
    }

    // 3) Resolve account id
    let accountId = profile?.psn_account_id ? String(profile.psn_account_id) : null;
    if (!accountId) {
      accountId = await getPsnAccountId(accessToken);
      if (!accountId) {
        return NextResponse.json({ error: "Failed to resolve PSN account id" }, { status: 500 });
      }

      await supabaseUser
        .from("profiles")
        .update({ psn_account_id: accountId, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }

    // ------------------------------------------------------------
    // A) Played games feed (usually best for playtime)
    // ------------------------------------------------------------
    let playedImported = 0;
    let playedUpdated = 0;

    const played = await getUserPlayedGames(accessToken, accountId);
    const playedRows = Array.isArray(played) ? played : [];

    for (const g of playedRows as any[]) {
      const titleName = String(g?.name ?? "").trim();
      if (!titleName) continue;

      // Prefer stable id if present, else synthetic
      const realId = String(g?.titleId ?? "").trim();
      const key = realId || makeSyntheticId(titleName, "PlayStation");

      const playtimeMinutes = isoDurationToMinutes(g?.playDuration);

      const res = await mergeUpsertPsnTitle(supabaseUser, user.id, key, {
        title_name: titleName,
        title_platform: "PlayStation",
        playtime_minutes: playtimeMinutes,
        // don't set trophy fields here (leave them to trophy feed / merge)
        last_updated_at: new Date().toISOString(),
      });

      if (res.ok && res.inserted) playedImported += 1;
      if (res.ok && res.updated) playedUpdated += 1;
    }

    // ------------------------------------------------------------
    // B) Trophy titles feed (best for trophy_progress + totals)
    // ------------------------------------------------------------
    let trophyImported = 0;
    let trophyUpdated = 0;

    const trophyTitles = await getUserTrophyTitlesPaged(accessToken, accountId);
    const trophyRows = Array.isArray(trophyTitles) ? trophyTitles : [];

    for (const t of trophyRows as any[]) {
      const titleName = String(t?.trophyTitleName ?? "").trim();
      if (!titleName) continue;

      const realId = String(t?.npCommunicationId ?? "").trim();
      const platform = String(t?.trophyTitlePlatform ?? "PlayStation").trim() || "PlayStation";
      const key = realId || makeSyntheticId(titleName, platform);

      const progress = t?.progress != null ? Number(t.progress) : null;

      const earnedObj = t?.earnedTrophies;
      const trophiesEarned =
        earnedObj
          ? Number(earnedObj.bronze || 0) +
            Number(earnedObj.silver || 0) +
            Number(earnedObj.gold || 0) +
            Number(earnedObj.platinum || 0)
          : null;

      const definedObj = t?.definedTrophies;
      const trophiesTotal =
        definedObj
          ? Number(definedObj.bronze || 0) +
            Number(definedObj.silver || 0) +
            Number(definedObj.gold || 0) +
            Number(definedObj.platinum || 0)
          : null;

      const res = await mergeUpsertPsnTitle(supabaseUser, user.id, key, {
        title_name: titleName,
        title_platform: platform,
        trophy_progress: progress,
        trophies_earned: trophiesEarned,
        trophies_total: trophiesTotal,
        last_updated_at: toIsoOrNow(t?.lastUpdatedDateTime),
      });

      if (res.ok && res.inserted) trophyImported += 1;
      if (res.ok && res.updated) trophyUpdated += 1;
    }

    // 4) Update profile stamps
    const lastCount = Math.max(playedRows.length, trophyRows.length);

    const { error: profUpdErr } = await supabaseUser
      .from("profiles")
      .update({
        psn_last_synced_at: new Date().toISOString(),
        psn_last_sync_count: lastCount,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (profUpdErr) {
      return NextResponse.json(
        { error: `Failed to update profile sync stamp: ${profUpdErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      played: { imported: playedImported, updated: playedUpdated, total: playedRows.length },
      trophies: { imported: trophyImported, updated: trophyUpdated, total: trophyRows.length },
      total: lastCount,
      synthetic_note:
        "If Sony doesn't return titleId/npCommunicationId for some titles, we store a deterministic synthetic id (synthetic:<platform>:<normalized title>) so you don't lose data.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "PSN sync failed" }, { status: 500 });
  }
}
