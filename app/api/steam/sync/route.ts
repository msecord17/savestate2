import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { createClient } from "@supabase/supabase-js";
import { upsertGameIgdbFirst } from "@/lib/igdb/server";
import { mergeReleaseInto } from "@/lib/merge-release-into";
import { releaseExternalIdRow } from "@/lib/release-external-ids";

function nowIso() {
  return new Date().toISOString();
}

function asInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

export async function POST() {
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

  // ─────────────────────────────────────────────────────────────
  // IMPORTANT: You must have the user's SteamID64 stored somewhere.
  // Adjust THIS BLOCK to match your schema.
  // Common options:
  // - profiles.steam_id
  // - profiles.steam_id64
  // - steam_connections.steamid
  // ─────────────────────────────────────────────────────────────
  const { data: profile, error: pErr } = await supabaseUser
    .from("profiles")
    .select("steam_id") // <-- CHANGE THIS if needed
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  const steamId64 = String((profile as any)?.steam_id ?? "").trim();
  if (!steamId64) {
    return NextResponse.json(
      { error: "Missing Steam ID (steam_id) on profiles for this user." },
      { status: 400 }
    );
  }

  const apiKey = String(process.env.STEAM_WEB_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing STEAM_WEB_API_KEY env var" },
      { status: 500 }
    );
  }

  // GetOwnedGames (playtime_forever is minutes)
  const url =
    `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/` +
    `?key=${encodeURIComponent(apiKey)}` +
    `&steamid=${encodeURIComponent(steamId64)}` +
    `&include_appinfo=1&include_played_free_games=1&format=json`;

  let games: any[] = [];
  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    games = Array.isArray(j?.response?.games) ? j.response.games : [];
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Steam API call failed" },
      { status: 500 }
    );
  }

  console.log("[steam/sync] games returned:", games.length);
  console.log("[steam/sync] first 3:", games.slice(0, 3).map(g => ({
    appid: g?.appid,
    name: g?.name,
    minutes: g?.playtime_forever,
  })));

  let mapped = 0;
  let createdReleases = 0;
  let upserted = 0;
  let skipped = 0;
  let errors: any[] = [];

  // Helper: find release_id by appid
  async function findReleaseIdForApp(appid: string) {
    const { data, error } = await supabaseAdmin
      .from("release_external_ids")
      .select("release_id")
      .eq("source", "steam")
      .eq("external_id", appid)
      .maybeSingle();

    if (error) return null;
    return data?.release_id ?? null;
  }

  for (const g of games) {
    const appid = String(g?.appid ?? "").trim();
    const name = String(g?.name ?? "").trim();
    const minutes = asInt(g?.playtime_forever);

    if (!appid || !name) {
      skipped += 1;
      continue;
    }

    // Only store meaningful signals. (You can remove this if you want 0-min rows.)
    // If you want “library presence” signals, keep even 0.
    // I recommend keeping 0 as owned library signal.
    // if (minutes <= 0) { skipped += 1; continue; }

    let releaseId = await findReleaseIdForApp(appid);

    // If no mapping exists yet: (1) game_id (2) find by (platform_key, game_id) (3) insert with 23505 (4) upsert mapping; if mapped release_id differs, merge
    if (!releaseId) {
      let gameId: string;
      try {
        const { game_id } = await upsertGameIgdbFirst(supabaseAdmin, name, { platform: "steam" });
        gameId = game_id;
      } catch {
        skipped += 1;
        continue;
      }

      const { data: existingRelease } = await supabaseAdmin
        .from("releases")
        .select("id")
        .eq("platform_key", "steam")
        .eq("game_id", gameId)
        .maybeSingle();

      if (existingRelease?.id) {
        releaseId = String(existingRelease.id);
      } else {
        const { data: newRelease, error: rErr } = await supabaseAdmin
          .from("releases")
          .insert({
            game_id: gameId,
            display_title: name,
            platform_key: "steam",
            platform_name: "Steam",
            platform_label: "Steam",
            cover_url: null,
          })
          .select("id")
          .single();

        if (rErr) {
          const code = (rErr as { code?: string })?.code;
          if (code === "23505") {
            const { data: raced } = await supabaseAdmin
              .from("releases")
              .select("id")
              .eq("platform_key", "steam")
              .eq("game_id", gameId)
              .maybeSingle();
            if (raced?.id) releaseId = String(raced.id);
            else { skipped += 1; continue; }
          } else {
            skipped += 1;
            continue;
          }
        } else if (newRelease?.id) {
          releaseId = String(newRelease.id);
          createdReleases += 1;
        } else {
          skipped += 1;
          continue;
        }
      }

      await supabaseAdmin
        .from("release_external_ids")
        .upsert(releaseExternalIdRow(releaseId, "steam", appid), {
          onConflict: "source,external_id",
          ignoreDuplicates: true,
        });

      const { data: currentMap } = await supabaseAdmin
        .from("release_external_ids")
        .select("release_id")
        .eq("source", "steam")
        .eq("external_id", appid)
        .maybeSingle();

      if (currentMap?.release_id && String(currentMap.release_id) !== releaseId) {
        await mergeReleaseInto(supabaseAdmin, String(currentMap.release_id), releaseId);
        releaseId = String(currentMap.release_id);
      }
    } else {
      mapped += 1;
    }

    // Upsert steam progress
    const { error: upErr } = await supabaseAdmin
      .from("steam_title_progress")
      .upsert(
        {
          user_id: user.id,
          release_id: releaseId,
          steam_appid: appid,
          title_name: name,
          playtime_minutes: minutes,
          last_updated_at: nowIso(),
        },
        { onConflict: "user_id,release_id" }
      );

    if (upErr) {
      errors.push({
        appid,
        releaseId,
        message: upErr.message,
        details: (upErr as any).details,
        hint: (upErr as any).hint,
        code: (upErr as any).code,
      });
      skipped += 1;
      continue;
    }

    upserted += 1;

    // Ensure portfolio entry exists for release (owned)
    const { data: existingEntry } = await supabaseAdmin
      .from("portfolio_entries")
      .select("user_id, release_id")
      .eq("user_id", user.id)
      .eq("release_id", releaseId)
      .maybeSingle();

    if (!existingEntry) {
      const { error: peErr } = await supabaseAdmin.from("portfolio_entries").insert({
        user_id: user.id,
        release_id: releaseId,
        status: "owned",
        updated_at: nowIso(),
      });

      if (peErr) console.warn("portfolio insert failed", peErr.message);
    }
  }

  return NextResponse.json({
    ok: true,
    total_owned_games: games.length,
    mapped_existing: mapped,
    created_releases: createdReleases,
    upserted_progress: upserted,
    skipped,
    errors,
  });
}
