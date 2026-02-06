import { NextResponse } from "next/server";
import { upsertGameIgdbFirst } from "@/lib/igdb/server";
import { supabaseServer } from "@/lib/supabase/server";

function slugPlatformKey(input: string) {
  const s = (input || "").toLowerCase().trim();

  // Small MVP mapping for common platforms (add as needed)
  const map: Record<string, string> = {
    "snes": "snes",
    "super nintendo entertainment system": "snes",
    "nes": "nes",
    "nintendo entertainment system": "nes",
    "nintendo 64": "n64",
    "n64": "n64",
    "gamecube": "gamecube",
    "nintendo gamecube": "gamecube",
    "wii": "wii",
    "wii u": "wiiu",
    "switch": "switch",
    "nintendo switch": "switch",

    "playstation": "ps1",
    "playstation 1": "ps1",
    "ps1": "ps1",
    "playstation 2": "ps2",
    "ps2": "ps2",
    "playstation 3": "ps3",
    "ps3": "ps3",
    "playstation 4": "ps4",
    "ps4": "ps4",
    "playstation 5": "ps5",
    "ps5": "ps5",

    "xbox": "xbox",
    "xbox 360": "x360",
    "xbox one": "xone",
    "xbox series x|s": "xsx",

    "pc (microsoft windows)": "pc",
    "windows": "pc",
    "pc": "pc",

    "sega genesis": "genesis",
    "mega drive": "genesis",
    "sega saturn": "saturn",
    "dreamcast": "dreamcast",
  };

  if (map[s]) return map[s];

  // fallback: slugify
  return s
    .replace(/\(|\)|\|/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "unknown";
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  const igdb_game_id = body?.igdb_game_id;
  const title = (body?.title ?? "").trim();
  const platform_name = (body?.platform_name ?? "").trim();
  const platform_abbr = (body?.platform_abbr ?? "").trim();

  const cover_url = body?.cover_url ?? null;
  const summary = body?.summary ?? null;
  const genres = Array.isArray(body?.genres) ? body.genres : [];
  const developer = body?.developer ?? null;
  const publisher = body?.publisher ?? null;

  if (!igdb_game_id || !title) {
    return NextResponse.json({ error: "Missing igdb_game_id or title" }, { status: 400 });
  }
  if (!platform_name && !platform_abbr) {
    return NextResponse.json({ error: "Missing platform" }, { status: 400 });
  }

  const platformKeySource = platform_abbr || platform_name;
  const platform_key = slugPlatformKey(platformKeySource);

  // 1) Ensure game row exists (use shared resolver: IGDB-first + 23505 handling)
  let game_id: string;
  try {
    const res = await upsertGameIgdbFirst(supabaseServer, title);
    game_id = res.game_id;
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message ?? "Game resolution failed" }, { status: 500 });
  }

  // 2) Ensure release exists: check by (igdb_game_id, platform_key) then by (platform_key, game_id)
  const { data: existingByIgdb, error: rSelErr } = await supabaseServer
    .from("releases")
    .select("id")
    .eq("igdb_game_id", igdb_game_id)
    .eq("platform_key", platform_key)
    .maybeSingle();

  if (rSelErr) return NextResponse.json({ error: rSelErr.message }, { status: 500 });

  if (existingByIgdb?.id) {
    return NextResponse.json({ release_id: existingByIgdb.id, created: false });
  }

  const { data: existingByPlatformGame, error: r2Err } = await supabaseServer
    .from("releases")
    .select("id")
    .eq("platform_key", platform_key)
    .eq("game_id", game_id)
    .maybeSingle();

  if (!r2Err && existingByPlatformGame?.id) {
    // Update existing release with igdb/metadata
    const { error: updErr } = await supabaseServer
      .from("releases")
      .update({
        display_title: title,
        platform_name: platform_name || platform_abbr || "Unknown",
        cover_provider: "igdb",
        igdb_game_id: body.igdb_game_id,
        cover_url: body.cover_url ?? null,
        summary,
        genres: genres.length ? genres : null,
        developer,
        publisher,
      })
      .eq("id", existingByPlatformGame.id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({ release_id: existingByPlatformGame.id, created: false });
  }

  const { data: insertedRelease, error: rInsErr } = await supabaseServer
    .from("releases")
    .insert({
      game_id,
      display_title: title,
      platform_name: platform_name || platform_abbr || "Unknown",
      platform_key,
      cover_provider: "igdb",
      igdb_game_id: body.igdb_game_id,
      cover_url: body.cover_url ?? null,
      summary,
      genres: genres.length ? genres : null,
      developer,
      publisher,
    })
    .select("id")
    .single();

  if (rInsErr) return NextResponse.json({ error: rInsErr.message }, { status: 500 });

  return NextResponse.json({ release_id: insertedRelease.id, created: true });
}
