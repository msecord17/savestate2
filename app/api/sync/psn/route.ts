import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";
import { igdbSearchBest, normalizeCanonicalTitle, upsertGameIgdbFirst } from "@/lib/igdb/server";
import { mergeReleaseInto } from "@/lib/merge-release-into";
import { releaseExternalIdRow } from "@/lib/release-external-ids";

import {
  getPsnAccessTokenFromNpsso,
  getPsnAccountId,
  getUserPlayedGames,
  getUserTrophyTitlesPaged,
  getUserTrophyGroupsForTitle,
} from "@/lib/psn/server";

/**
 * Strategy:
 * - Store PSN title signal in psn_title_progress (same as today)
 * - ALSO map each PSN title -> releases.id using release_external_ids
 * - platform_key stays 'psn'
 * - platform_label becomes PS5/PS4/PS3/Vita/etc (from PSN trophyTitlePlatform when possible)
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
  return `synthetic:${platform}:${normTitle(titleName)}`;
}

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

function canonicalPlatformLabel(raw: string | null | undefined) {
  // PSN commonly returns: "PS5", "PS4", "PS3", "PSVITA", etc.
  const s = String(raw || "").trim();
  if (!s) return "PlayStation";

  const u = s.toUpperCase();
  if (u.includes("PS5")) return "PS5";
  if (u.includes("PS4")) return "PS4";
  if (u.includes("PS3")) return "PS3";
  if (u.includes("VITA")) return "Vita";
  if (u.includes("PSP")) return "PSP";
  if (u.includes("PS2")) return "PS2";
  if (u.includes("PS1") || u.includes("PSX")) return "PS1";

  // default fallback
  return s;
}

// Split CamelCase / mashed titles (TigerWoodsPGATOUR07 → Tiger Woods PGA TOUR 07)
function deMashTitle(s: string) {
  return (s || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2");
}

/**
 * Merge-upsert for psn_title_progress:
 * - Upsert by (user_id, np_communication_id)
 * - Never clobber non-null fields with null
 * - Keep max playtime_minutes
 * - Keep newest last_updated_at
 */
async function mergeUpsertPsnTitle(
  supabase: any,
  userId: string,
  key: string,
  patch: {
    title_name?: string | null;
    title_platform?: string | null; // we will store specific label here (PS5/PS4/...)
    playtime_minutes?: number | null;
    trophy_progress?: number | null;
    trophies_earned?: number | null;
    trophies_total?: number | null;
    last_updated_at?: string | null;
    release_id?: string | null;
    title_icon_url?: string | null;
  }
) {
  const { data: existing, error: exErr } = await supabase
    .from("psn_title_progress")
    .select(
      "user_id, np_communication_id, title_name, title_platform, playtime_minutes, trophy_progress, trophies_earned, trophies_total, last_updated_at, release_id, title_icon_url"
    )
    .eq("user_id", userId)
    .eq("np_communication_id", key)
    .maybeSingle();

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

    title_name: patch.title_name ?? current?.title_name ?? null,
    title_platform: patch.title_platform ?? current?.title_platform ?? null,

    playtime_minutes: nextPlaytime,

    trophy_progress: patch.trophy_progress ?? current?.trophy_progress ?? null,
    trophies_earned: patch.trophies_earned ?? current?.trophies_earned ?? null,
    trophies_total: patch.trophies_total ?? current?.trophies_total ?? null,

    // release_id should be sticky once set
    release_id: patch.release_id ?? current?.release_id ?? null,

    title_icon_url: patch.title_icon_url ?? current?.title_icon_url ?? null,

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

/**
 * Ensure a releases row exists for this PSN title, anchored on release_external_ids(source='psn', external_id).
 * (0) Lookup mapping first and return if exists; (1) resolve game_id; (2) find by (platform_key, game_id);
 * (3) insert with 23505 race handling; (4) upsert mapping (ignoreDuplicates); if mapped release_id differs, merge and use mapped.
 */
async function ensureReleaseForPsnTitle(opts: {
  admin: any;
  titleName: string;
  psnExternalId: string; // real npCommunicationId/titleId OR synthetic id
  platformLabel: string; // PS5/PS4/...
}) {
  const { admin, titleName, psnExternalId, platformLabel } = opts;

  // (0) Anchor: lookup release_external_ids(source='psn', external_id) and return if exists
  const { data: mapRow, error: mapErr } = await admin
    .from("release_external_ids")
    .select("release_id")
    .eq("source", "psn")
    .eq("external_id", psnExternalId)
    .maybeSingle();

  if (mapErr) throw new Error(`release_external_ids lookup failed: ${mapErr.message}`);
  if (mapRow?.release_id) return String(mapRow.release_id);

  // (1) Resolve game_id via IGDB-first
  const { game_id: gameId } = await upsertGameIgdbFirst(admin, titleName, { platform: "psn" });

  // (2) Find release by (platform_key='psn', game_id)
  const { data: existingByGame, error: findErr } = await admin
    .from("releases")
    .select("id")
    .eq("platform_key", "psn")
    .eq("game_id", gameId)
    .maybeSingle();

  if (findErr) throw new Error(`Failed to check existing release: ${findErr.message}`);

  let releaseId: string;

  if (existingByGame?.id) {
    releaseId = String(existingByGame.id);
  } else {
    // (3) Insert release with 23505 race handling
    const releaseInsert: any = {
      game_id: gameId,
      display_title: titleName.trim(),
      platform_key: "psn",
      platform_name: "PlayStation",
      platform_label: platformLabel,
      cover_url: null,
    };

    const { data: releaseRow, error: rErr } = await admin
      .from("releases")
      .insert(releaseInsert)
      .select("id")
      .single();

    if (rErr) {
      const code = (rErr as { code?: string })?.code;
      if (code === "23505") {
        // Unique violation on (platform_key, game_id): another insert won the race
        const { data: raced, error: raceErr } = await admin
          .from("releases")
          .select("id")
          .eq("platform_key", "psn")
          .eq("game_id", gameId)
          .maybeSingle();
        if (raceErr || !raced?.id) throw new Error(`release race lookup failed: ${raceErr?.message || "no row"}`);
        releaseId = String(raced.id);
      } else {
        throw new Error(`Failed to insert release: ${rErr.message}`);
      }
    } else if (releaseRow?.id) {
      releaseId = String(releaseRow.id);
    } else {
      throw new Error("Failed to insert release: no id returned");
    }
  }

  // (4) Upsert release_external_ids; do not overwrite existing mapping (ignoreDuplicates)
  const { error: mapUpErr } = await admin
    .from("release_external_ids")
    .upsert(releaseExternalIdRow(releaseId, "psn", psnExternalId), {
      onConflict: "source,external_id",
      ignoreDuplicates: true,
    });

  if (mapUpErr) {
    console.error(`Warning: Failed to upsert release_external_ids: ${mapUpErr.message}`);
  }

  // If mapping already existed with a different release_id, merge our release into the anchored one
  const { data: currentMap, error: selErr } = await admin
    .from("release_external_ids")
    .select("release_id")
    .eq("source", "psn")
    .eq("external_id", psnExternalId)
    .maybeSingle();

  if (!selErr && currentMap?.release_id) {
    const anchoredId = String(currentMap.release_id);
    if (anchoredId !== releaseId) {
      await mergeReleaseInto(admin, anchoredId, releaseId);
      return anchoredId;
    }
  }

  return releaseId;
}

/**
 * Ensure portfolio entry exists (don’t overwrite manual status).
 */
async function ensurePortfolioEntry(supabaseUser: any, userId: string, releaseId: string) {
  const { data: existing, error: exErr } = await supabaseUser
    .from("portfolio_entries")
    .select("user_id, release_id, status")
    .eq("user_id", userId)
    .eq("release_id", releaseId)
    .maybeSingle();

  if (exErr) throw new Error(`portfolio_entries lookup failed: ${exErr.message}`);
  if (existing) return;

  const { error: insErr } = await supabaseUser.from("portfolio_entries").insert({
    user_id: userId,
    release_id: releaseId,
    status: "owned",
    updated_at: new Date().toISOString(),
  });

  if (insErr) throw new Error(`portfolio_entries insert failed: ${insErr.message}`);
}

export async function POST() {
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1) Load NPSSO + cached account id
    const { data: profile, error: pErr } = await supabaseUser
      .from("profiles")
      .select("psn_npsso, psn_account_id, psn_online_id")
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
    const onlineId = String(profile?.psn_online_id ?? "").trim();

    if (!accountId) {
      accountId = await getPsnAccountId(accessToken, onlineId);
      if (!accountId) {
        return NextResponse.json({ error: "Failed to resolve PSN account id" }, { status: 500 });
      }

      await supabaseUser
        .from("profiles")
        .update({ psn_account_id: accountId, updated_at: new Date().toISOString() })
        .eq("user_id", user.id);
    }

    // ------------------------------------------------------------
    // A) Played games feed (playtime)
    // ------------------------------------------------------------
    let playedImported = 0;
    let playedUpdated = 0;
    let releasesTouched = 0;

    const played = await getUserPlayedGames(accessToken, accountId);
    const playedRows = Array.isArray(played) ? played : [];

    for (const g of playedRows as any[]) {
      const titleName = String(g?.name ?? "").trim();
      if (!titleName) continue;

      // played feed often doesn't have platform granularity -> default to PlayStation
      const platformLabel = "PlayStation";

      const realId = String(g?.titleId ?? "").trim();
      const key = realId || makeSyntheticId(titleName, platformLabel);

      const playtimeMinutes = isoDurationToMinutes(g?.playDuration);

      // Ensure release + mapping
      const releaseId = await ensureReleaseForPsnTitle({
        admin: supabaseAdmin,
        titleName,
        psnExternalId: key,
        platformLabel,
      });

      releasesTouched += 1;

      const res = await mergeUpsertPsnTitle(supabaseUser, user.id, key, {
        title_name: titleName,
        title_platform: platformLabel,
        playtime_minutes: playtimeMinutes,
        last_updated_at: new Date().toISOString(),
        release_id: releaseId,
      });

      if (res.ok && res.inserted) playedImported += 1;
      if (res.ok && res.updated) playedUpdated += 1;

      await ensurePortfolioEntry(supabaseUser, user.id, releaseId);
    }

    // ------------------------------------------------------------
    // B) Trophy titles feed (platform + completion signal)
    // ------------------------------------------------------------
    let trophyImported = 0;
    let trophyUpdated = 0;

    const trophyTitles = await getUserTrophyTitlesPaged(accessToken, accountId);
    const trophyRows = Array.isArray(trophyTitles) ? trophyTitles : [];

    for (const t of trophyRows as any[]) {
      const titleName = String(t?.trophyTitleName ?? "").trim();
      if (!titleName) continue;

      const rawPlatform = String(t?.trophyTitlePlatform ?? "PlayStation").trim() || "PlayStation";
      const platformLabel = canonicalPlatformLabel(rawPlatform);

      const realId = String(t?.npCommunicationId ?? "").trim();
      const key = realId || makeSyntheticId(titleName, platformLabel);

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

      const releaseId = await ensureReleaseForPsnTitle({
        admin: supabaseAdmin,
        titleName,
        psnExternalId: key,
        platformLabel,
      });

      releasesTouched += 1;

      const iconUrl = String(t?.trophyTitleIconUrl ?? "").trim() || null;

      const res = await mergeUpsertPsnTitle(supabaseUser, user.id, key, {
        title_name: titleName,
        title_platform: platformLabel,
        trophy_progress: progress,
        trophies_earned: trophiesEarned,
        trophies_total: trophiesTotal,
        last_updated_at: toIsoOrNow(t?.lastUpdatedDateTime),
        release_id: releaseId,
        title_icon_url: iconUrl,
      });

      if (res.ok && res.inserted) trophyImported += 1;
      if (res.ok && res.updated) trophyUpdated += 1;

      await ensurePortfolioEntry(supabaseUser, user.id, releaseId);
    }

    // ------------------------------------------------------------
    // C) Trophy group chips (Minimap-style)
    // ------------------------------------------------------------
    let groupImported = 0;
    let groupUpdated = 0;

    // We only do this for titles that have a real npCommunicationId.
    // Synthetic IDs won't work for this endpoint.
    const realNpIds = trophyRows
      .map((t: any) => String(t?.npCommunicationId ?? "").trim())
      .filter(Boolean);

    // De-dupe
    const uniqNpIds = Array.from(new Set(realNpIds));

    for (const npId of uniqNpIds) {
      try {
        const groups = await getUserTrophyGroupsForTitle(accessToken, accountId, npId);

        if (!Array.isArray(groups) || groups.length === 0) {
          console.log(`[PSN Sync] No trophy groups returned for ${npId}`);
          continue;
        }

        for (const g of groups as any[]) {
          const trophy_group_id = String(g?.trophyGroupId ?? "").trim() || "default";
          const trophy_group_name = String(g?.trophyGroupName ?? "").trim() || null;
          const trophy_group_icon_url = String(g?.trophyGroupIconUrl ?? "").trim() || null;

          const progress = g?.progress != null ? Number(g.progress) : null;

          const earnedObj = g?.earnedTrophies;
          const earned =
            earnedObj
              ? Number(earnedObj.bronze || 0) +
                Number(earnedObj.silver || 0) +
                Number(earnedObj.gold || 0) +
                Number(earnedObj.platinum || 0)
              : null;

          const definedObj = g?.definedTrophies;
          const total =
            definedObj
              ? Number(definedObj.bronze || 0) +
                Number(definedObj.silver || 0) +
                Number(definedObj.gold || 0) +
                Number(definedObj.platinum || 0)
              : null;

          // Upsert the chip row
          const { error: upErr } = await supabaseUser
            .from("psn_trophy_group_progress")
            .upsert(
              {
                user_id: user.id,
                np_communication_id: npId,
                trophy_group_id,
                trophy_group_name,
                trophy_group_icon_url,
                progress,
                earned,
                total,
                last_updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,np_communication_id,trophy_group_id" }
            );

          if (!upErr) {
            groupImported += 1;
          } else {
            console.error(`[PSN Sync] Failed to upsert trophy group for ${npId}:`, upErr);
          }
        }
      } catch (err: any) {
        console.error(`[PSN Sync] Error fetching trophy groups for ${npId}:`, err?.message || err);
        // Continue with other titles even if one fails
      }
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
      trophy_groups: { imported: groupImported, unique_titles: uniqNpIds.length },
      total: lastCount,
      releases_touched: releasesTouched,
      note: "This sync now also maps PSN titles into releases + release_external_ids, ensures portfolio_entries exists, and imports trophy group chips.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "PSN sync failed" }, { status: 500 });
  }
}
