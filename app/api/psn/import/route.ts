import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { upsertGameIgdbFirst } from "@/lib/igdb/server";
import { releaseExternalIdRow } from "@/lib/release-external-ids";

function normTitle(t: string) {
  return (t || "")
    .toLowerCase()
    .replace(/[\u2122\u00ae]/g, "") // ™ ®
    .replace(/[^a-z0-9\s:.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function psnPlatformKey() {
  return "psn";
}

// Split CamelCase / mashed titles (TigerWoodsPGATOUR07 → Tiger Woods PGA TOUR 07)
function deMashTitle(s: string) {
  return (s || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2");
}

export async function POST() {
  try {
    // user-scoped client (RLS)
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // service-role client (catalog writes)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1) Load PSN progress rows
    const { data: psnRows, error: pErr } = await supabaseUser
      .from("psn_title_progress")
      .select("np_communication_id, title_name, title_platform, playtime_minutes, trophy_progress, trophies_earned, trophies_total, last_updated_at")
      .eq("user_id", user.id)
      .order("last_updated_at", { ascending: false });

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const rows = Array.isArray(psnRows) ? psnRows : [];
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, imported: 0, updated: 0, total: 0, note: "No PSN titles found. Run PSN Sync first." });
    }

    let imported = 0;
    let updated = 0;
    let matched = 0;
    let createdGames = 0;
    let createdReleases = 0;

    // 2) For each PSN title, resolve release by external id first (release_external_ids),
    //    then create only if missing, then upsert mapping.
    for (const r of rows) {
      const titleRaw = String(r.title_name || "").trim();
      if (!titleRaw) continue;

      const title = titleRaw;
      const norm = normTitle(title);

      const npid = String((r as any)?.np_communication_id ?? "").trim();

      // A) try to find existing game by canonical title (fast+cheap MVP)
      //    we do 2 passes: exact-ish normalized match, then ilike contains.
      let gameId: string | null = null;

      // exact-ish pass (fetch a small window and compare normalized)
      {
        const { data: candidates } = await supabaseAdmin
          .from("games")
          .select("id, canonical_title")
          .ilike("canonical_title", `%${title.replace(/%/g, "")}%`)
          .limit(20);

        if (Array.isArray(candidates)) {
          const found = candidates.find((c: any) => normTitle(String(c.canonical_title || "")) === norm);
          if (found?.id) gameId = found.id;
          else if (candidates[0]?.id) gameId = candidates[0].id; // fallback: first candidate
        }
      }

      // B) if no game found, create/attach one (IGDB-first, fallback to title)
      if (!gameId) {
        try {
          const { game_id } = await upsertGameIgdbFirst(supabaseAdmin, title, { platform: "psn" });
          gameId = game_id;
          if (gameId) createdGames += 1;
        } catch {
          continue;
        }
      }

      if (!gameId) continue;

      // C) resolve release_id via external id first (preferred)
      let releaseId: string | null = null;
      if (npid) {
        const { data: ext } = await supabaseAdmin
          .from("release_external_ids")
          .select("release_id")
          .eq("source", "psn")
          .eq("external_id", npid)
          .maybeSingle();
        if (ext?.release_id) releaseId = String(ext.release_id);
      }

      // If not mapped yet, find/create a PSN release for this game
      if (!releaseId) {
        const { data: relExisting } = await supabaseAdmin
          .from("releases")
          .select("id")
          .eq("game_id", gameId)
          .eq("platform_key", psnPlatformKey())
          .maybeSingle();

        if (relExisting?.id) {
          releaseId = relExisting.id;
        } else {
          const { data: newRelease, error: rErr } = await supabaseAdmin
            .from("releases")
            .insert({
              game_id: gameId,
              display_title: title,
              platform_name: "PlayStation",
              platform_key: psnPlatformKey(),
              // cover_url: null (we can add later)
            })
            .select("id")
            .single();

          if (rErr || !newRelease?.id) continue;
          releaseId = newRelease.id;
          createdReleases += 1;
        }

        // Upsert mapping if we have a stable external id
        if (npid && releaseId) {
          await supabaseAdmin
            .from("release_external_ids")
            .upsert(releaseExternalIdRow(releaseId, "psn", npid), { onConflict: "source,external_id" });
        }
      }

      if (!releaseId) continue;

      matched += 1;

      // D) upsert into portfolio_entries (DON’T overwrite manual status/rating)
      const incomingPlaytime = Number(r.playtime_minutes || 0);

      const { data: existingEntry, error: exErr } = await supabaseUser
        .from("portfolio_entries")
        .select("user_id, release_id, status, rating, playtime_minutes, last_played_at")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (exErr) continue;

      if (!existingEntry) {
        const { error: insErr } = await supabaseUser.from("portfolio_entries").insert({
          user_id: user.id,
          release_id: releaseId,
          status: incomingPlaytime > 0 ? "playing" : "owned",
          playtime_minutes: incomingPlaytime,
          last_played_at: null,
          updated_at: new Date().toISOString(),
        });

        if (!insErr) imported += 1;
      } else {
        // only increase playtime
        const current = Number(existingEntry.playtime_minutes || 0);
        const next = Math.max(current, incomingPlaytime);

        if (next !== current) {
          const { error: updErr } = await supabaseUser
            .from("portfolio_entries")
            .update({ playtime_minutes: next, updated_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("release_id", releaseId);

          if (!updErr) updated += 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      imported,
      updated,
      total: rows.length,
      matched,
      created_games: createdGames,
      created_releases: createdReleases,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "PSN import failed" }, { status: 500 });
  }
}
