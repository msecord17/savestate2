import { NextResponse } from "next/server";
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

  // 1) Ensure game row exists (simple select-then-insert to avoid ON CONFLICT constraints)
  const canonical_title = title;

  const { data: existingGame, error: gSelErr } = await supabaseServer
    .from("games")
    .select("id")
    .eq("canonical_title", canonical_title)
    .maybeSingle();

  if (gSelErr) {
    return NextResponse.json({ error: gSelErr.message }, { status: 500 });
  }

  let game_id = existingGame?.id as string | undefined;

  if (!game_id) {
    const { data: insertedGame, error: gInsErr } = await supabaseServer
      .from("games")
      .insert({
        canonical_title,
        genres: genres.length ? genres : null,
        first_release_year: null,
      })
      .select("id")
      .single();

    if (gInsErr) return NextResponse.json({ error: gInsErr.message }, { status: 500 });
    game_id = insertedGame.id as string;
  }

  // 2) Ensure release exists for (igdb_game_id, platform_key)
  const { data: existingRelease, error: rSelErr } = await supabaseServer
    .from("releases")
    .select("id")
    .eq("igdb_game_id", igdb_game_id)
    .eq("platform_key", platform_key)
    .maybeSingle();

  if (rSelErr) return NextResponse.json({ error: rSelErr.message }, { status: 500 });

  if (existingRelease?.id) {
    return NextResponse.json({ release_id: existingRelease.id, created: false });
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
