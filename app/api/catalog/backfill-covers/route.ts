import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { igdbSearchBest } from "@/lib/igdb/server";

function nowIso() {
  return new Date().toISOString();
}

// Split CamelCase / mashed titles (TigerWoodsPGATOUR07 → Tiger Woods PGA TOUR 07)
function deMashTitle(s: string) {
  return (s || "")
    // split camelCase / PascalCase boundaries
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // split ABC123 → ABC 123
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    // split 123ABC → 123 ABC
    .replace(/(\d)([A-Za-z])/g, "$1 $2");
}

// Clean title for IGDB search
export function cleanTitleForSearch(title: string) {
  return deMashTitle(String(title || ""))
    .replace(/™|®/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/\[.*?\]/g, " ")
    .replace(/:\s*(standard|deluxe|gold|ultimate|complete|anniversary|remastered|definitive|edition).*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  const url = new URL(req.url);

  // Tune these without redeploying:
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
  const dryRun = url.searchParams.get("dry_run") === "1";

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1) Find games missing cover_url
  const { data: games, error: gErr } = await supabaseAdmin
    .from("games")
    .select("id, canonical_title, igdb_game_id, cover_url")
    .is("cover_url", null)
    .not("canonical_title", "is", null)
    .limit(limit);

  if (gErr) return NextResponse.json({ ok: false, error: gErr.message }, { status: 500 });

  const rows = Array.isArray(games) ? games : [];
  if (!rows.length) {
    return NextResponse.json({ ok: true, processed: 0, updated_games: 0, updated_releases: 0, skipped: 0, note: "No games missing cover_url." });
  }

  let processed = 0;
  let updatedGames = 0;
  let updatedReleases = 0;
  let skipped = 0;

  const gameUpdates: Array<{
    id: string;
    canonical_title: string; // original title from database
    igdb_title: string | null; // title from IGDB (may be better)
    cover_url: string;
    igdb_game_id: number | null;
    summary: string | null;
    genres: string[] | null;
    developer: string | null;
    publisher: string | null;
    first_release_year: number | null;
  }> = [];

  const debug: Array<any> = [];

  // 2) For each game, search IGDB and collect updates
  for (const g of rows) {
    processed += 1;

    const raw = String(g?.canonical_title ?? "").trim();
    if (!raw) {
      skipped += 1;
      continue;
    }

    // Try multiple search attempts with cleaned titles
    const q1 = cleanTitleForSearch(raw);
    const q2 = cleanTitleForSearch(raw.replace(/[:\-].*$/, "")); // drop subtitle if needed

    const hit = (await igdbSearchBest(q1)) ?? (await igdbSearchBest(q2));

    if (!hit?.cover_url) {
      skipped += 1;
      debug.push({ game_id: g.id, title: raw, q1, q2, result: "no_cover_found" });
      continue;
    }

    gameUpdates.push({
      id: g.id,
      canonical_title: raw, // original title from database
      igdb_title: hit.title ?? null, // IGDB title (may be better)
      cover_url: hit.cover_url,
      igdb_game_id: hit.igdb_game_id ?? null,
      summary: hit.summary ?? null,
      genres: hit.genres && hit.genres.length > 0 ? hit.genres : null,
      developer: hit.developer ?? null,
      publisher: hit.publisher ?? null,
      first_release_year: hit.first_release_year ?? null,
    });

    debug.push({
      game_id: g.id,
      title: raw,
      q1,
      q2,
      igdb_game_id_existing: g.igdb_game_id ?? null,
      igdb_game_id_matched: hit.igdb_game_id,
      cover_url: hit.cover_url,
    });
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      processed,
      would_update_games: gameUpdates.length,
      skipped,
      sample: debug.slice(0, 10),
    });
  }

  if (!gameUpdates.length) {
    return NextResponse.json({
      ok: true,
      processed,
      updated_games: 0,
      updated_releases: 0,
      skipped,
      note: "No covers found in this batch.",
      sample: debug.slice(0, 10),
    });
  }

  // 3) Update games with cover_url + metadata
  // 🛡️ BULLETPROOF: Always pin canonical_title to prevent NOT NULL constraint violations
  let gameUpdateErrors = 0;
  const gameIdsWithCovers = new Set<string>();

  for (const u of gameUpdates) {
    const raw = String(u.canonical_title ?? "").trim();
    if (!raw) {
      console.warn("[backfill-covers] skip: missing canonical_title", { id: u.id });
      continue;
    }

    // Build the update object WITHOUT canonical_title by default
    const patch: any = {
      cover_url: u.cover_url,
      cover_source: "igdb_search",
      cover_updated_at: nowIso(),

      // metadata (these columns DO exist in your games table)
      igdb_game_id: u.igdb_game_id,
      summary: u.summary,
      genres: u.genres,
      developer: u.developer,
      publisher: u.publisher,
      first_release_year: u.first_release_year,

      updated_at: nowIso(),
    };

    // Use IGDB title if it's better (different and valid)
    const betterTitle = String(u.igdb_title || "").trim();
    if (betterTitle && betterTitle.length >= 2 && betterTitle.toLowerCase() !== raw.toLowerCase()) {
      // Optional: only do this if you're comfortable "correcting" titles
      patch.canonical_title = betterTitle;
    } else {
      // Fallback to original title
      patch.canonical_title = raw;
    }

    const { error } = await supabaseAdmin
      .from("games")
      .update(patch)
      .eq("id", u.id);

    if (error) {
      gameUpdateErrors += 1;
      console.warn("[backfill-covers] game update failed", { id: u.id, error: error.message });
    } else {
      gameIdsWithCovers.add(u.id);
      updatedGames += 1;
    }
  }

  // 4) Propagate game covers to related releases with null/unknown cover_url
  if (gameIdsWithCovers.size > 0) {
    const gameIdsArray = Array.from(gameIdsWithCovers);
    
    // Get all releases for these games that have null or unknown.png cover_url
    const { data: releases, error: rErr } = await supabaseAdmin
      .from("releases")
      .select("id, game_id, cover_url")
      .in("game_id", gameIdsArray)
      .or("cover_url.is.null,cover_url.ilike.%unknown.png%");

    if (rErr) {
      console.warn("[backfill-covers] failed to fetch releases", { error: rErr.message });
    } else {
      const releasesToUpdate = Array.isArray(releases) ? releases : [];
      
      // Group releases by game_id to batch update with game cover_url
      const releasesByGame = new Map<string, string[]>();
      for (const r of releasesToUpdate) {
        const gameId = String(r?.game_id ?? "");
        if (gameId && gameIdsWithCovers.has(gameId)) {
          if (!releasesByGame.has(gameId)) {
            releasesByGame.set(gameId, []);
          }
          releasesByGame.get(gameId)!.push(String(r.id));
        }
      }

      // Update releases with their game's cover_url
      for (const [gameId, releaseIds] of releasesByGame.entries()) {
        const gameUpdate = gameUpdates.find((u) => u.id === gameId);
        if (!gameUpdate?.cover_url) continue;

        const { error: updateErr } = await supabaseAdmin
          .from("releases")
          .update({
            cover_url: gameUpdate.cover_url,
            updated_at: nowIso(),
          })
          .in("id", releaseIds);

        if (updateErr) {
          console.warn("[backfill-covers] release update failed", { game_id: gameId, release_ids: releaseIds, error: updateErr.message });
        } else {
          updatedReleases += releaseIds.length;
        }
      }
    }
  }

  return NextResponse.json({
    ok: gameUpdateErrors === 0,
    processed,
    updated_games: updatedGames,
    updated_releases: updatedReleases,
    skipped,
    game_update_errors: gameUpdateErrors,
    sample: debug.slice(0, 10),
  });
}
