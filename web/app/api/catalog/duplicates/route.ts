import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

// normalize titles so "Diablo® IV" == "Diablo IV"
function normTitle(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/™|®|©/g, "")
    .replace(/[:\-–—]/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(edition|deluxe|ultimate|definitive|remastered|complete)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBadCover(url: string | null) {
  if (!url) return true;
  const u = url.toLowerCase();
  return u.includes("unknown.png") || u.includes("placeholder");
}

export async function GET(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const user = userRes.user;

  // We only care about duplicates *in the user's library*
  const { data: entries, error } = await supabase
    .from("portfolio_entries")
    .select(
      `
      release_id,
      releases:release_id (
        id,
        display_title,
        platform_key,
        cover_url,
        game_id,
        updated_at,
        games (
          id,
          canonical_title,
          igdb_game_id,
          cover_url
        )
      )
    `
    )
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (entries || [])
    .map((e: any) => e?.releases ? ({ ...e.releases }) : null)
    .filter(Boolean);

  // group by normalized title (and platform family if you want; keeping it simple first)
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const title = r?.games?.canonical_title || r?.display_title || "";
    const key = normTitle(title);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const duplicates = [];
  for (const [key, rels] of groups.entries()) {
    if (rels.length < 2) continue;

    duplicates.push({
      key,
      count: rels.length,
      releases: rels.map((r) => ({
        release_id: r.id,
        display_title: r.display_title,
        platform_key: r.platform_key,
        release_cover: r.cover_url,
        game_id: r.game_id,
        game_title: r.games?.canonical_title ?? null,
        igdb_game_id: r.games?.igdb_game_id ?? null,
        game_cover: r.games?.cover_url ?? null,
        bad_cover: isBadCover(r.cover_url) && isBadCover(r.games?.cover_url ?? null),
        updated_at: r.updated_at,
      })),
    });
  }

  // sort: biggest problems first
  duplicates.sort((a, b) => b.count - a.count);

  return NextResponse.json({
    ok: true,
    total_library_releases: rows.length,
    duplicate_groups: duplicates.length,
    duplicates: duplicates.slice(0, 100), // keep response manageable
    note: "This is only duplicates inside YOUR library (portfolio_entries).",
  });
}
