import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { ensureGameTitleOnly } from "@/lib/igdb/server";
import { mergeReleaseInto } from "@/lib/merge-release-into";
import { releaseExternalIdRow } from "@/lib/release-external-ids";
import { recomputeArchetypesForUser } from "@/lib/insights/recompute";

type SteamOwnedGame = {
  appid: number;
  name?: string;
  playtime_forever?: number; // minutes
  rtime_last_played?: number; // unix seconds
};

function steamHeaderImage(appid: number) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
}

function nowIso() {
  return new Date().toISOString();
}

export async function POST() {
  try {
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    const { data: profile, error: pErr } = await supabaseUser
      .from("profiles")
      .select("steam_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    const steamid = String(profile?.steam_id ?? "").trim();
    if (!steamid) {
      return NextResponse.json({ error: "Steam not connected" }, { status: 400 });
    }

    const key = process.env.STEAM_WEB_API_KEY;
    if (!key) {
      return NextResponse.json(
        { error: "Missing STEAM_WEB_API_KEY in env" },
        { status: 500 }
      );
    }

    const url =
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/` +
      `?key=${encodeURIComponent(key)}` +
      `&steamid=${encodeURIComponent(steamid)}` +
      `&include_appinfo=1&include_played_free_games=1&format=json`;

    const steamRes = await fetch(url, { cache: "no-store" });
    const steamJson = await steamRes.json().catch(() => null);
    const games: SteamOwnedGame[] =
      Array.isArray(steamJson?.response?.games) ? steamJson.response.games : [];

    if (!steamRes.ok) {
      return NextResponse.json(
        { error: `Steam API failed (${steamRes.status})`, detail: steamJson },
        { status: 500 }
      );
    }

    if (games.length === 0) {
      return NextResponse.json({
        ok: true,
        total: 0,
        mapped: 0,
        releases_created: 0,
        portfolio_upserted: 0,
        enrichment_state_upserted: 0,
        note:
          "No games returned. If Steam privacy is private, set Steam Privacy -> Game details to Public.",
      });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let mapped = 0;
    let releasesCreated = 0;
    let portfolioUpserted = 0;
    let enrichmentStateUpserted = 0;
    const errors: { appid: string; message: string }[] = [];

    for (const g of games) {
      const appid = Number(g.appid);
      const title = (g.name || `Steam App ${appid}`).trim();
      const playtime = Number(g.playtime_forever || 0);
      const steamExternalId = String(appid);
      const incomingLastPlayed =
        typeof g.rtime_last_played === "number" && g.rtime_last_played > 0
          ? new Date(g.rtime_last_played * 1000).toISOString()
          : null;

      // 1) Ensure mapping exists: release_external_ids(source='steam', external_id=appid)
      const { data: mapRow, error: mapErr } = await supabaseAdmin
        .from("release_external_ids")
        .select("release_id")
        .eq("source", "steam")
        .eq("external_id", steamExternalId)
        .maybeSingle();

      if (mapErr) {
        errors.push({ appid: steamExternalId, message: mapErr.message });
        continue;
      }

      let releaseId: string | null = mapRow?.release_id ? String(mapRow.release_id) : null;

      if (releaseId) {
        mapped += 1;
      } else {
        // 2) No mapping: create game (title only, NO IGDB), release, then mapping
        let gameId: string;
        try {
          const res = await ensureGameTitleOnly(supabaseAdmin, title);
          gameId = res.game_id;
        } catch (e: any) {
          errors.push({ appid: steamExternalId, message: e?.message ?? "game create failed" });
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
              display_title: title,
              platform_name: "Steam",
              platform_key: "steam",
              steam_appid: appid,
              cover_url: steamHeaderImage(appid),
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
              else {
                errors.push({ appid: steamExternalId, message: String(rErr.message) });
                continue;
              }
            } else {
              errors.push({ appid: steamExternalId, message: String(rErr.message) });
              continue;
            }
          } else if (newRelease?.id) {
            releaseId = String(newRelease.id);
            releasesCreated += 1;
          } else {
            continue;
          }
        }

        await supabaseAdmin
          .from("release_external_ids")
          .upsert(releaseExternalIdRow(releaseId, "steam", steamExternalId), {
            onConflict: "source,external_id",
            ignoreDuplicates: true,
          });

        const { data: currentMap } = await supabaseAdmin
          .from("release_external_ids")
          .select("release_id")
          .eq("source", "steam")
          .eq("external_id", steamExternalId)
          .maybeSingle();

        if (currentMap?.release_id && String(currentMap.release_id) !== releaseId) {
          await mergeReleaseInto(supabaseAdmin, String(currentMap.release_id), releaseId);
          releaseId = String(currentMap.release_id);
        }
      }

      if (!releaseId) continue;

      // 3) steam_title_progress (playtime + last_updated for gamehome/release page)
      await supabaseAdmin
        .from("steam_title_progress")
        .upsert(
          {
            user_id: user.id,
            release_id: releaseId,
            steam_appid: steamExternalId,
            title_name: title,
            playtime_minutes: playtime,
            last_updated_at: nowIso(),
          },
          { onConflict: "user_id,release_id" }
        );

      // 4) Create/ensure portfolio_entries + update playtime_minutes and last_played_at
      const { data: existingEntry } = await supabaseUser
        .from("portfolio_entries")
        .select("user_id, release_id, playtime_minutes, last_played_at")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (!existingEntry) {
        const { error: insErr } = await supabaseUser.from("portfolio_entries").insert({
          user_id: user.id,
          release_id: releaseId,
          status: "owned",
          playtime_minutes: playtime,
          last_played_at: incomingLastPlayed,
          updated_at: nowIso(),
        });
        if (!insErr) portfolioUpserted += 1;
        else errors.push({ appid: steamExternalId, message: insErr.message });
      } else {
        const currentPlaytime = Number(existingEntry.playtime_minutes ?? 0);
        const nextPlaytime = Math.max(currentPlaytime, playtime);
        let nextLastPlayed = (existingEntry.last_played_at as string | null) ?? null;
        if (incomingLastPlayed) {
          if (!nextLastPlayed || new Date(incomingLastPlayed) > new Date(nextLastPlayed)) {
            nextLastPlayed = incomingLastPlayed;
          }
        }
        const { error: updErr } = await supabaseUser
          .from("portfolio_entries")
          .update({
            playtime_minutes: nextPlaytime,
            last_played_at: nextLastPlayed,
            updated_at: nowIso(),
          })
          .eq("user_id", user.id)
          .eq("release_id", releaseId);
        if (!updErr) portfolioUpserted += 1;
        else errors.push({ appid: steamExternalId, message: updErr.message });
      }

      // 5) Insert/update release_enrichment_state so enrichment can pick it up
      const { error: enrichErr } = await supabaseAdmin
        .from("release_enrichment_state")
        .upsert(
          {
            release_id: releaseId,
            source: "steam",
            updated_at: nowIso(),
          },
          { onConflict: "release_id" }
        );
      if (!enrichErr) enrichmentStateUpserted += 1;
    }

    const { error: profUpdErr } = await supabaseUser
      .from("profiles")
      .update({
        steam_last_synced_at: nowIso(),
        steam_last_sync_count: games.length,
        updated_at: nowIso(),
      })
      .eq("user_id", user.id);

    if (profUpdErr) {
      return NextResponse.json(
        { error: `Profile sync stamp: ${profUpdErr.message}` },
        { status: 500 }
      );
    }

    try {
      await recomputeArchetypesForUser(supabaseUser, user.id);
    } catch {
      // Non-fatal: sync succeeded; archetype snapshot will refresh on next GET or recompute
    }

    return NextResponse.json({
      ok: true,
      total: games.length,
      mapped,
      releases_created: releasesCreated,
      portfolio_upserted: portfolioUpserted,
      enrichment_state_upserted: enrichmentStateUpserted,
      errors: errors.length ? errors : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Sync failed" }, { status: 500 });
  }
}
