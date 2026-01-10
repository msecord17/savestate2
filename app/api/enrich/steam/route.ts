import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { igdbSearchBest } from "@/lib/igdb/server";

export async function POST(req: Request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 40), 80);

  // Get Steam releases and their games; we'll enrich only those games missing igdb_game_id
  const { data: rows, error } = await supabaseAdmin
    .from("releases")
    .select("id, display_title, cover_url, game_id, platform_key, games(id, igdb_game_id)")
    .eq("platform_key", "steam")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const targets = (rows ?? []).filter((r: any) => r?.game_id && !r?.games?.igdb_game_id);

  let enriched = 0;
  let skipped = 0;

  for (const r of targets) {
    const title = String(r.display_title || "").trim();
    if (!title) {
      skipped++;
      continue;
    }

    const hit = await igdbSearchBest(title);
    if (!hit?.igdb_game_id) {
      skipped++;
      continue;
    }

    await supabaseAdmin
      .from("games")
      .update({
        igdb_game_id: hit.igdb_game_id,
        summary: hit.summary,
        genres: hit.genres,
        developer: hit.developer,
        publisher: hit.publisher,
        first_release_year: hit.first_release_year,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.game_id);

    // Fill cover_url only if missing
    if (!r.cover_url && hit.cover_url) {
      await supabaseAdmin
        .from("releases")
        .update({ cover_url: hit.cover_url, updated_at: new Date().toISOString() })
        .eq("id", r.id);
    }

    enriched++;
  }

  return NextResponse.json({
    ok: true,
    considered: targets.length,
    enriched,
    skipped,
    limit,
  });
}
