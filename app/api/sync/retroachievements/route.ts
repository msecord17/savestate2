import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";
import { supabaseServer } from "@/lib/supabase/server";

type RARecent = {
  GameID: number;
  ConsoleID: number;
  ConsoleName: string;
  Title: string;
  LastPlayed?: string | null;
};

type RAWantToPlayItem = {
  ID: number;
  Title: string;
  ConsoleID: number;
  ConsoleName: string;
};
// RetroAchievements ConsoleID -> our platform_key
// (MVP mapping: extend anytime; unknown IDs fall back to ra:<id>)
const RA_PLATFORM_KEY_MAP: Record<number, string> = {
    1: "snes",
    2: "nes",
    3: "genesis",
    4: "sega_cd",
    5: "gb",
    6: "gbc",
    7: "gba",
    8: "n64",
    9: "ps1",
    10: "ps2",
    11: "psp",
    12: "dreamcast",
    13: "saturn",
    14: "master_system",
    15: "game_gear",
    16: "pc_engine",
    17: "neo_geo",
    18: "arcade",
    19: "snes_msx", // if you have MSX separately later, adjust
    20: "nds",
    21: "gamecube",
    22: "wii",
    23: "wii_u",
    24: "switch",
    25: "3ds",
    26: "ps3",
    27: "xbox",
    28: "xbox_360",
    29: "xbox_one",
    30: "ps4",
    31: "ps5",
  };
  
export async function POST() {
  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  // Read RA creds
  const { data: profile, error: pErr } = await supabase
    .from("user_profiles")
    .select("ra_username, ra_api_key")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const raUsername = profile?.ra_username?.trim();
  const raKey = profile?.ra_api_key?.trim();

  if (!raUsername || !raKey) {
    return NextResponse.json(
      { error: "Missing RA username or API key. Set them in Profile." },
      { status: 400 }
    );
  }

  // 1) Recently played (max 50)  :contentReference[oaicite:4]{index=4}
  const recentUrl =
    `https://retroachievements.org/API/API_GetUserRecentlyPlayedGames.php` +
    `?y=${encodeURIComponent(raKey)}` +
    `&u=${encodeURIComponent(raUsername)}` +
    `&c=50&o=0`;

  const recentRes = await fetch(recentUrl, { cache: "no-store" });
  if (!recentRes.ok) {
    const txt = await recentRes.text();
    return NextResponse.json(
      { error: `RA recent fetch failed (${recentRes.status}): ${txt}` },
      { status: 502 }
    );
  }
  const recent = (await recentRes.json()) as RARecent[];

  // 2) Want-to-play (max 500)  :contentReference[oaicite:5]{index=5}
  const wtpUrl =
    `https://retroachievements.org/API/API_GetUserWantToPlayList.php` +
    `?y=${encodeURIComponent(raKey)}` +
    `&u=${encodeURIComponent(raUsername)}` +
    `&c=500&o=0`;

  const wtpRes = await fetch(wtpUrl, { cache: "no-store" });
  if (!wtpRes.ok) {
    const txt = await wtpRes.text();
    return NextResponse.json(
      { error: `RA want-to-play fetch failed (${wtpRes.status}): ${txt}` },
      { status: 502 }
    );
  }
  const wtpJson = await wtpRes.json();
  const wantToPlay: RAWantToPlayItem[] = Array.isArray(wtpJson)
    ? wtpJson
    : (wtpJson?.Results ?? wtpJson?.results ?? []);

  // Helper: ensure game + release exist; return release_id
  async function ensureRelease(params: {
    ra_game_id: number;
    ra_console_id: number;
    title: string;
    consoleName: string;
  }) {
    // Create/Upsert game (canonical_title)
    const canonical_title = params.title;

    const { data: gameRow, error: gErr } = await supabaseServer
      .from("games")
      .upsert(
        {
          canonical_title,
          genres: [],
          first_release_year: null,
        },
        { onConflict: "canonical_title" }
      )
      .select("id")
      .single();

    if (gErr) throw new Error(`games upsert failed: ${gErr.message}`);

    // Create/Upsert release tied to RA GameID
    const { data: releaseRow, error: rErr } = await supabaseServer
      .from("releases")
      .upsert(
        {
            game_id: gameRow.id,
            display_title: params.title,
            platform_name: params.consoleName,
          
            // ✅ required by your schema + consistent keys for filters later
            platform_key:
              RA_PLATFORM_KEY_MAP[params.ra_console_id] ?? `ra:${params.ra_console_id}`,
          
            source: "retroachievements",
            ra_game_id: params.ra_game_id,
            ra_console_id: params.ra_console_id,
          },
        { onConflict: "ra_game_id" }
      )
      .select("id")
      .single();

    if (rErr) throw new Error(`releases upsert failed: ${rErr.message}`);

    return releaseRow.id as string;
  }

  // Fetch existing portfolio entries for this user (so we don't overwrite status)
  const { data: existingEntries, error: eErr } = await supabaseServer
    .from("portfolio_entries")
    .select("release_id, status")
    .eq("user_id", user.id);

  if (eErr) throw new Error(`portfolio select failed: ${eErr.message}`);

  const existingSet = new Set((existingEntries ?? []).map((x) => x.release_id));

  let added = 0;
  let updated = 0;

  // Recently played -> status playing (only for new entries)
  for (const g of recent) {
    const releaseId = await ensureRelease({
      ra_game_id: g.GameID,
      ra_console_id: g.ConsoleID,
      title: g.Title,
      consoleName: g.ConsoleName,
    });

    if (!existingSet.has(releaseId)) {
      const { error } = await supabaseServer.from("portfolio_entries").insert({
        user_id: user.id,
        release_id: releaseId,
        status: "playing",
        source: "retroachievements",
        last_played_at: g.LastPlayed ? new Date(g.LastPlayed).toISOString() : null,
      });
      if (!error) {
        added++;
        existingSet.add(releaseId);
      }
    } else {
      // only update last_played_at, don't touch status
      await supabaseServer
        .from("portfolio_entries")
        .update({
          last_played_at: g.LastPlayed ? new Date(g.LastPlayed).toISOString() : null,
        })
        .eq("user_id", user.id)
        .eq("release_id", releaseId);
      updated++;
    }
  }

  // Want-to-play -> status wishlist (only for new entries)
  for (const g of wantToPlay) {
    const releaseId = await ensureRelease({
      ra_game_id: g.ID,
      ra_console_id: g.ConsoleID,
      title: g.Title,
      consoleName: g.ConsoleName,
    });

    if (!existingSet.has(releaseId)) {
      const { error } = await supabaseServer.from("portfolio_entries").insert({
        user_id: user.id,
        release_id: releaseId,
        status: "wishlist",
        source: "retroachievements",
      });
      if (!error) {
        added++;
        existingSet.add(releaseId);
      }
    }
  }

  return NextResponse.json({ ok: true, added, updated });
}
