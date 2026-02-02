import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { igdbSearchBest, upsertGameIgdbFirst } from "@/lib/igdb/server";
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

export async function POST() {
  try {
    // 1) Logged-in user (this makes it work for ANY user, not just you)
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const user = userRes.user;

    // 2) Get this user's connected steam_id
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

    // 3) Steam Web API key (server env)
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
        imported: 0,
        updated: 0,
        total: 0,
        note:
          "No games returned. If Steam privacy is private, set Steam Privacy -> Game details to Public.",
      });
    }

    // 4) Admin client for catalog writes (games/releases)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let imported = 0;
    let updated = 0;

    for (const g of games) {
      const appid = Number(g.appid);
      const title = (g.name || `Steam App ${appid}`).trim();
      const playtime = Number(g.playtime_forever || 0);
      const steamExternalId = String(appid);

      // 1) Resolve platform external id = steam appid
      // 2) Find release_external_ids(source, external_id) → release_id
      const { data: mapRow, error: mapErr } = await supabaseAdmin
        .from("release_external_ids")
        .select("release_id")
        .eq("source", "steam")
        .eq("external_id", steamExternalId)
        .maybeSingle();

      if (mapErr) {
        return NextResponse.json(
          { error: `release_external_ids lookup: ${mapErr.message}` },
          { status: 500 }
        );
      }

      let releaseId: string | null = mapRow?.release_id ? String(mapRow.release_id) : null;
      let gameId: string | null = null;

      if (releaseId) {
        const { data: rel } = await supabaseAdmin
          .from("releases")
          .select("id, game_id, cover_url")
          .eq("id", releaseId)
          .maybeSingle();
        gameId = rel?.game_id ?? null;
        await supabaseAdmin
          .from("releases")
          .update({
            display_title: title,
            platform_name: "Steam",
            platform_key: "steam",
            cover_url: rel?.cover_url ?? steamHeaderImage(appid),
            updated_at: new Date().toISOString(),
          })
          .eq("id", releaseId);
        updated += 1;
      }

      // 3) If no release: (1) game_id (2) find by (platform_key, game_id) (3) insert with 23505 (4) upsert mapping; if mapped release_id differs, merge
      if (!releaseId) {
        try {
          const { game_id: gid } = await upsertGameIgdbFirst(supabaseAdmin, title, { platform: "steam" });
          gameId = gid;
        } catch {
          console.warn("Steam sync: game resolution failed for", title);
          continue;
        }

        const { data: existingRelease, error: findErr } = await supabaseAdmin
          .from("releases")
          .select("id")
          .eq("platform_key", "steam")
          .eq("game_id", gameId)
          .maybeSingle();

        if (findErr) {
          console.warn("Steam sync: release lookup failed", findErr.message);
          continue;
        }

        if (existingRelease?.id) {
          releaseId = existingRelease.id;
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
                console.warn("Steam sync: 23505 but no row found for", title);
                continue;
              }
            } else {
              return NextResponse.json(
                { error: `Failed to insert release for ${title}: ${rErr?.message || "unknown"}` },
                { status: 500 }
              );
            }
          } else if (newRelease?.id) {
            releaseId = String(newRelease.id);
            imported += 1;
          } else {
            console.warn("Steam sync: no id returned for", title);
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

      // Incoming last played
      const incomingLastPlayed =
        typeof g.rtime_last_played === "number" && g.rtime_last_played > 0
          ? new Date(g.rtime_last_played * 1000).toISOString()
          : null;

      // ✅ D) IGDB enrichment only when igdb_game_id IS NULL (spine rule: never re-search a good match)
      if (gameId) {
        const { data: gameRow } = await supabaseAdmin
          .from("games")
          .select("id, igdb_game_id, summary, genres, developer, publisher, first_release_year")
          .eq("id", gameId)
          .maybeSingle();

        const needsIgdb =
          !gameRow?.igdb_game_id &&
          (!gameRow?.summary ||
            !gameRow?.developer ||
            !gameRow?.publisher ||
            !gameRow?.first_release_year ||
            !gameRow?.genres);

        if (needsIgdb) {
          const hit = await igdbSearchBest(title);

          if (hit?.igdb_game_id) {
            await supabaseAdmin
              .from("games")
              .update({
                igdb_game_id: hit.igdb_game_id,
                summary: gameRow?.summary ?? hit.summary,
                genres: gameRow?.genres ?? hit.genres,
                developer: gameRow?.developer ?? hit.developer,
                publisher: gameRow?.publisher ?? hit.publisher,
                first_release_year: gameRow?.first_release_year ?? hit.first_release_year,
                updated_at: new Date().toISOString(),
              })
              .eq("id", gameId);

            // If release cover is missing, fill from IGDB (keeps Steam header if already present)
            if (hit.cover_url) {
              const { data: relRow } = await supabaseAdmin
                .from("releases")
                .select("id, cover_url")
                .eq("id", releaseId)
                .maybeSingle();

              if (!relRow?.cover_url) {
                await supabaseAdmin
                  .from("releases")
                  .update({ cover_url: hit.cover_url, updated_at: new Date().toISOString() })
                  .eq("id", releaseId);
              }
            }
          }
        }
      }

      // C) Upsert portfolio entry (do NOT overwrite user status/rating)
      const { data: existingEntry, error: exErr } = await supabaseUser
        .from("portfolio_entries")
        .select("user_id, release_id, status, rating, playtime_minutes, last_played_at")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (exErr) {
        return NextResponse.json(
          { error: `Failed to check existing portfolio entry for ${title}: ${exErr.message}` },
          { status: 500 }
        );
      }

      if (!existingEntry) {
        const { error: insErr } = await supabaseUser.from("portfolio_entries").insert({
          user_id: user.id,
          release_id: releaseId,
          status: "owned",
          playtime_minutes: playtime,
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
        const nextPlaytime = Math.max(currentPlaytime, playtime);

        let nextLastPlayed = existingEntry.last_played_at as string | null;
        if (incomingLastPlayed) {
          if (!nextLastPlayed || new Date(incomingLastPlayed) > new Date(nextLastPlayed)) {
            nextLastPlayed = incomingLastPlayed;
          }
        }

        const patch: any = {
          playtime_minutes: nextPlaytime,
          last_played_at: nextLastPlayed,
          updated_at: new Date().toISOString(),
        };

        const { error: updErr } = await supabaseUser
          .from("portfolio_entries")
          .update(patch)
          .eq("user_id", user.id)
          .eq("release_id", releaseId);

        if (updErr) {
          return NextResponse.json(
            { error: `Failed to update portfolio entry for ${title}: ${updErr.message}` },
            { status: 500 }
          );
        }
      }
    }

    // Save sync timestamp + count on this user's profile
    const { error: profUpdErr } = await supabaseUser
      .from("profiles")
      .update({
        steam_last_synced_at: new Date().toISOString(),
        steam_last_sync_count: games.length,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (profUpdErr) {
      return NextResponse.json(
        { error: `Failed to update profile sync stamp: ${profUpdErr.message}` },
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
      imported,
      updated,
      total: games.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Sync failed" }, { status: 500 });
  }
}
