import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";
import { igdbSearchBest } from "@/lib/igdb/server";

type RAGameRow = {
  gameId: number;
  consoleId?: number;
  consoleName?: string;
  title?: string;
  imageIcon?: string; // e.g. "/Images/1234.png"
  numAchievements?: number;
  pointsTotal?: number;
  lastPlayed?: string; // "2024-01-01 12:34:56" sometimes
};

function raIconUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  // RA commonly returns paths like "/Images/123.png"
  return `https://media.retroachievements.org${path}`;
}

function platformKeyFromConsoleName(name: string | null | undefined) {
  const n = String(name || "").toLowerCase();

  // MVP mapping (expand later)
  if (n.includes("super nintendo") || n.includes("snes")) return "snes";
  if (n.includes("nintendo entertainment system") || n === "nes") return "nes";
  if (n.includes("mega drive") || n.includes("genesis")) return "genesis";
  if (n.includes("playstation")) return "ps1";
  if (n.includes("nintendo 64") || n.includes("n64")) return "n64";
  if (n.includes("dreamcast")) return "dreamcast";
  if (n.includes("saturn")) return "saturn";
  if (n.includes("game boy advance") || n.includes("gba")) return "gba";
  if (n.includes("game boy color") || n.includes("gbc")) return "gbc";
  if (n === "game boy" || n.includes("game boy")) return "gb";
  if (n.includes("arcade")) return "arcade";

  // fallback
  return "retro";
}

function platformNameFromConsoleName(name: string | null | undefined) {
  return name || "RetroAchievements";
}

async function raFetchJSON(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  return { res, json };
}

export async function POST() {
  try {
    // A) Logged in user
    const supabaseUser = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }
    const user = userRes.user;

    // B) Load RA creds from profiles
    const { data: profile, error: pErr } = await supabaseUser
      .from("profiles")
      .select("ra_username, ra_api_key")
      .eq("user_id", user.id)
      .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const ra_username = String(profile?.ra_username ?? "").trim();
    const ra_api_key = String(profile?.ra_api_key ?? "").trim();

    if (!ra_username || !ra_api_key) {
      return NextResponse.json(
        { error: "RetroAchievements not connected (missing username or api key)" },
        { status: 400 }
      );
    }

    // C) RA API call: get user games list
    // Using RA Web API: API_GetUserCompletedGames
    // Docs: https://api-docs.retroachievements.org/
    //
    // We'll use Completed Games because it's stable + meaningful.
    // You can switch to API_GetUserRecentlyPlayedGames later for "playing".
    const url =
      `https://retroachievements.org/API/API_GetUserCompletedGames.php` +
      `?z=${encodeURIComponent(ra_username)}` +
      `&y=${encodeURIComponent(ra_api_key)}` +
      `&u=${encodeURIComponent(ra_username)}`;

    const { res: raRes, json: raJson } = await raFetchJSON(url);

    if (!raRes.ok) {
      return NextResponse.json(
        { error: `RA API failed (${raRes.status})`, detail: raJson },
        { status: 500 }
      );
    }

    // RA returns an object keyed by gameId sometimes; normalize to array
    let games: RAGameRow[] = [];
    if (Array.isArray(raJson)) {
      games = raJson as any;
    } else if (raJson && typeof raJson === "object") {
      games = Object.values(raJson) as any;
    }

    if (!games.length) {
      return NextResponse.json({ ok: true, imported: 0, note: "No completed games returned." });
    }

    // D) Admin client for catalog writes (games/releases)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let imported = 0;
    let updated = 0;

    for (const g of games) {
      const raGameId = Number((g as any).GameID ?? g.gameId ?? 0);
      const title = String((g as any).Title ?? g.title ?? "").trim();
      const consoleName = String((g as any).ConsoleName ?? g.consoleName ?? "").trim();
      const iconPath = (g as any).ImageIcon ?? g.imageIcon ?? null;

      if (!raGameId || !title) continue;

      const platform_key = platformKeyFromConsoleName(consoleName);
      const platform_name = platformNameFromConsoleName(consoleName);
      const cover_url = raIconUrl(iconPath);

      // 1) Find existing release by ra_game_id
      const { data: existingRelease } = await supabaseAdmin
        .from("releases")
        .select("id, game_id")
        .eq("ra_game_id", raGameId)
        .maybeSingle();

      let releaseId: string | null = existingRelease?.id ?? null;
      let gameId: string | null = existingRelease?.game_id ?? null;

      // 2) If no release, create or reuse game by canonical_title (handle duplicates)
      if (!releaseId) {
        // Try find game by canonical_title first (because you have unique constraint)
        const { data: foundGame } = await supabaseAdmin
          .from("games")
          .select("id")
          .eq("canonical_title", title)
          .maybeSingle();

        if (foundGame?.id) {
          gameId = foundGame.id;
        } else {
          const { data: newGame, error: gErr } = await supabaseAdmin
            .from("games")
            .insert({ canonical_title: title })
            .select("id")
            .single();

          if (gErr || !newGame?.id) {
            // If we raced and hit unique constraint, re-select
            const { data: retryGame } = await supabaseAdmin
              .from("games")
              .select("id")
              .eq("canonical_title", title)
              .maybeSingle();

            if (!retryGame?.id) {
              return NextResponse.json(
                { error: `Failed to insert/find game for ${title}: ${gErr?.message || "unknown"}` },
                { status: 500 }
              );
            }
            gameId = retryGame.id;
          } else {
            gameId = newGame.id;
          }
        }

        // Create release tied to RA GameID
        const { data: newRelease, error: rErr } = await supabaseAdmin
          .from("releases")
          .insert({
            game_id: gameId,
            display_title: title,
            platform_name,
            platform_key,
            ra_game_id: raGameId,
            cover_url,
          })
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
        // Safe update (don’t overwrite cover_url if already set)
        await supabaseAdmin
          .from("releases")
          .update({
            display_title: title,
            platform_name,
            platform_key,
            ...(cover_url ? { cover_url } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", releaseId);

        updated += 1;
      }

      // ✅ IGDB enrichment (runs for BOTH new + existing entries)
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

            // If release cover is missing, fill from IGDB (keeps RA icon if already present)
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

      // 3) Upsert portfolio entry (status completed)
      // We won't overwrite a user's manual status if it's already "playing" etc.
      // But for completed games, it’s reasonable to mark completed if entry doesn’t exist.
      const { data: existingEntry, error: eErr } = await supabaseUser
        .from("portfolio_entries")
        .select("status")
        .eq("user_id", user.id)
        .eq("release_id", releaseId)
        .maybeSingle();

      if (eErr) {
        return NextResponse.json(
          { error: `Failed to check portfolio entry for ${title}: ${eErr.message}` },
          { status: 500 }
        );
      }

      if (!existingEntry) {
        const { error: insErr } = await supabaseUser.from("portfolio_entries").insert({
          user_id: user.id,
          release_id: releaseId,
          status: "completed",
          updated_at: new Date().toISOString(),
        });

        if (insErr) {
          return NextResponse.json(
            { error: `Failed to insert portfolio entry for ${title}: ${insErr.message}` },
            { status: 500 }
          );
        }
      } else {
        // Optional: if user has it as owned/wishlist, we can upgrade to completed
        const s = String(existingEntry.status || "");
        if (s === "owned" || s === "wishlist" || s === "back_burner") {
          await supabaseUser
            .from("portfolio_entries")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("release_id", releaseId);
        }
      }
    }

    // Save stamp
    await supabaseUser
      .from("profiles")
      .update({
        ra_last_synced_at: new Date().toISOString(),
        ra_last_sync_count: games.length,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    return NextResponse.json({
      ok: true,
      imported,
      updated,
      total: games.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "RA sync failed" }, { status: 500 });
  }
}
