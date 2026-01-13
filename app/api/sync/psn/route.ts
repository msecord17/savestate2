import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";

// NOTE: adjust this import to match your PSN helper lib.
// You likely have something like this already from earlier steps.
// If your helper function names differ, tell me what they are and I’ll swap them.
import {
  getPsnAccessTokenFromNpsso,
  getPsnAccountId,
  getUserPlayedGames,
  getUserTrophyTitlesPaged,
} from "@/lib/psn/server";

export async function POST() {
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // Service role client for any catalog writes if you need later (not required here)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1) Load NPSSO
    const { data: profile, error: pErr } = await supabaseUser
      .from("profiles")
      .select("psn_npsso, psn_account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const npsso = String(profile?.psn_npsso ?? "").trim();
    if (!npsso) return NextResponse.json({ error: "PSN not connected (missing NPSSO)" }, { status: 400 });

    // 2) Get PSN access token
    const accessToken = await getPsnAccessTokenFromNpsso(npsso);
    if (!accessToken) return NextResponse.json({ error: "Failed to get PSN access token" }, { status: 500 });

    // 3) Resolve account id (aka accountId) once
    let accountId = profile?.psn_account_id ? String(profile.psn_account_id) : null;
    if (!accountId) {
      accountId = await getPsnAccountId(accessToken);
      if (!accountId) return NextResponse.json({ error: "Failed to resolve PSN account id" }, { status: 500 });

      // save it so future syncs are faster
      await supabaseUser
        .from("profiles")
        .update({
          psn_account_id: accountId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    }

    // ------------------------------------------------------------
    // A) Played games (often smaller list; may include playtime)
    // ------------------------------------------------------------
    let imported = 0;
    let updated = 0;

    const played = await getUserPlayedGames(accessToken, accountId);
    const playedRows = Array.isArray(played) ? played : [];

    for (const g of playedRows) {
      // getUserPlayedGames returns: { titleId, name, playDuration (ISO 8601), imageUrl, ... }
      const np_communication_id = String(g?.titleId ?? "").trim();
      const title_name = String(g?.name ?? "").trim();

      if (!np_communication_id || !title_name) continue;

      // Convert playDuration (ISO 8601 like "PT228H56M33S") to minutes
      let playtime_minutes: number | null = null;
      if (g?.playDuration) {
        const duration = String(g.playDuration);
        const hours = /(\d+)H/.exec(duration)?.[1];
        const mins = /(\d+)M/.exec(duration)?.[1];
        const secs = /(\d+)S/.exec(duration)?.[1];
        const h = hours ? Number(hours) : 0;
        const m = mins ? Number(mins) : 0;
        const s = secs ? Number(secs) : 0;
        playtime_minutes = Math.round(h * 60 + m + s / 60);
      }

      const patch: any = {
        user_id: user.id,
        np_communication_id,
        title_name,
        title_platform: "PlayStation", // getUserPlayedGames doesn't return platform
        playtime_minutes,
        last_updated_at: new Date().toISOString(),

        // fields we will fill in section B if available
        trophy_progress: null,
        trophies_earned: null,
        trophies_total: null,
      };

      const { data: existing, error: exErr } = await supabaseUser
        .from("psn_title_progress")
        .select("user_id, np_communication_id")
        .eq("user_id", user.id)
        .eq("np_communication_id", np_communication_id)
        .maybeSingle();

      if (exErr) continue;

      if (!existing) {
        const { error: insErr } = await supabaseUser.from("psn_title_progress").insert(patch);
        if (!insErr) imported += 1;
      } else {
        const { error: updErr } = await supabaseUser
          .from("psn_title_progress")
          .update(patch)
          .eq("user_id", user.id)
          .eq("np_communication_id", np_communication_id);
        if (!updErr) updated += 1;
      }
    }

    // ------------------------------------------------------------
    // B) Trophy titles (THIS is where progress comes from)
    // ------------------------------------------------------------
    // This is typically the best source for trophy_progress.
    // It usually includes a lot more titles than "played games", depending on the endpoint.
    let trophyUpdated = 0;
    let trophyImported = 0;
    let trophyTotal = 0;

    // getUserTrophyTitlesPaged should return an array of pages combined
    // Each item should resemble:
    // { npCommunicationId, trophyTitleName, trophyTitlePlatform, progress, earnedTrophies, definedTrophies, lastUpdatedDateTime }
    const trophyTitles = await getUserTrophyTitlesPaged(accessToken, accountId);
    const trophyRows = Array.isArray(trophyTitles) ? trophyTitles : [];
    trophyTotal = trophyRows.length;

    for (const t of trophyRows) {
      const np_communication_id = String(t?.npCommunicationId ?? "").trim();
      const title_name = String(t?.trophyTitleName ?? "").trim();

      if (!np_communication_id || !title_name) continue;

      const progress = t?.progress != null ? Number(t.progress) : null;
      
      // earnedTrophies and definedTrophies are objects with bronze, silver, gold, platinum
      const earnedObj = t?.earnedTrophies;
      const earned = earnedObj
        ? (Number(earnedObj.bronze || 0) +
            Number(earnedObj.silver || 0) +
            Number(earnedObj.gold || 0) +
            Number(earnedObj.platinum || 0))
        : null;
      
      const definedObj = t?.definedTrophies;
      const total = definedObj
        ? (Number(definedObj.bronze || 0) +
            Number(definedObj.silver || 0) +
            Number(definedObj.gold || 0) +
            Number(definedObj.platinum || 0))
        : null;

      const patch: any = {
        user_id: user.id,
        np_communication_id,
        title_name,
        title_platform: t?.trophyTitlePlatform ?? "PlayStation",
        trophy_progress: progress,
        trophies_earned: earned,
        trophies_total: total,
        last_updated_at: t?.lastUpdatedDateTime ?? new Date().toISOString(),
      };

      const { data: existing, error: exErr } = await supabaseUser
        .from("psn_title_progress")
        .select("user_id, np_communication_id")
        .eq("user_id", user.id)
        .eq("np_communication_id", np_communication_id)
        .maybeSingle();

      if (exErr) continue;

      if (!existing) {
        const { error: insErr } = await supabaseUser.from("psn_title_progress").insert(patch);
        if (!insErr) trophyImported += 1;
      } else {
        const { error: updErr } = await supabaseUser
          .from("psn_title_progress")
          .update(patch)
          .eq("user_id", user.id)
          .eq("np_communication_id", np_communication_id);

        if (!updErr) trophyUpdated += 1;
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
      return NextResponse.json({ error: `Failed to update profile sync stamp: ${profUpdErr.message}` }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      played: { imported, updated, total: playedRows.length },
      trophies: { imported: trophyImported, updated: trophyUpdated, total: trophyTotal },
      total: lastCount,
      note: "If trophy totals are still 0, PSN privacy settings may be restricting trophy visibility.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "PSN sync failed" }, { status: 500 });
  }
}
