import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isLikelyNonGame, igdbSearchBest } from "@/lib/igdb/server";

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

function normalizeTitleForIgdb(title: string) {
  return deMashTitle(String(title || ""))
    .replace(/\(.*?\)/g, " ") // remove (PS5), (USA), etc
    .replace(/\[.*?\]/g, " ") // remove [PSN], [EU], etc
    .replace(/™|®/g, "")
    .replace(/\s+-\s+.*/g, " ") // strip trailing " - something"
    .replace(/:\s*(standard|deluxe|gold|ultimate|complete|anniversary|remastered|definitive|edition).*/i, "") // strip editions
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(req: Request) {
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);

  // Find games missing igdb_game_id (and usually missing cover_url too)
  const { data: games, error: gErr } = await supabaseAdmin
    .from("games")
    .select("id, canonical_title, igdb_game_id, cover_url")
    .is("igdb_game_id", null)
    .not("canonical_title", "is", null)
    .limit(limit);

  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  const rows = Array.isArray(games) ? games : [];
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      updated_ids: 0,
      updated_covers: 0,
      skipped: 0,
      message: "No games missing igdb_game_id.",
    });
  }

  let updatedIds = 0;
  let updatedCovers = 0;
  let skipped = 0;
  const errors: Array<{ game_id: string; title: string; error: string }> = [];

  // Pull releases + PSN title names for better search candidates (PSN sometimes mangles canonical_title)
  const gameIds = rows.map((g: any) => String(g.id)).filter(Boolean);
  const { data: relRows } = await supabaseAdmin
    .from("releases")
    .select("id, game_id, display_title, platform_key")
    .in("game_id", gameIds);

  const releasesByGame = new Map<string, any[]>();
  const releaseIds: string[] = [];
  for (const r of Array.isArray(relRows) ? relRows : []) {
    const gid = String(r?.game_id ?? "");
    if (!gid) continue;
    if (!releasesByGame.has(gid)) releasesByGame.set(gid, []);
    releasesByGame.get(gid)!.push(r);
    if (r?.id) releaseIds.push(String(r.id));
  }

  const psnByRelease: Record<string, any> = {};
  if (releaseIds.length) {
    const { data: psnRows } = await supabaseAdmin
      .from("psn_title_progress")
      .select("release_id, title_name")
      .in("release_id", releaseIds);
    for (const p of Array.isArray(psnRows) ? psnRows : []) {
      if (p?.release_id) psnByRelease[String(p.release_id)] = p;
    }
  }

  for (const g of rows as any[]) {
    const canonical = String(g?.canonical_title ?? "").trim();
    if (!canonical) {
      skipped += 1;
      continue;
    }
    if (isLikelyNonGame(canonical)) {
      skipped += 1;
      continue;
    }

    try {
      // Build candidate titles in priority order:
      // - Best PSN title_name (if any)
      // - Shortest release display_title
      // - canonical_title (last)
      const rels = releasesByGame.get(String(g.id)) ?? [];
      const psnTitles = rels
        .filter((r: any) => String(r?.platform_key ?? "").toLowerCase() === "psn" && psnByRelease[String(r?.id)]?.title_name)
        .map((r: any) => String(psnByRelease[String(r.id)]?.title_name ?? "").trim())
        .filter(Boolean);

      const releaseTitles = rels
        .map((r: any) => String(r?.display_title ?? "").trim())
        .filter(Boolean)
        .sort((a: string, b: string) => a.length - b.length);

      const candidatesRaw = [
        ...psnTitles,
        ...releaseTitles.slice(0, 3),
        canonical,
      ];

      const candidates = Array.from(
        new Set(candidatesRaw.map(normalizeTitleForIgdb).filter(Boolean))
      ).slice(0, 6);

      let hit: any = null;
      let usedTitle = canonical;
      for (const t of candidates) {
        usedTitle = t;
        hit = await igdbSearchBest(t);
        if (hit?.igdb_game_id) break;
      }

      const igdbId = hit?.igdb_game_id ? Number(hit.igdb_game_id) : null;
      if (!igdbId || !Number.isFinite(igdbId)) {
        skipped += 1;
        continue;
      }

      const patch: any = {
        igdb_game_id: igdbId,
        updated_at: new Date().toISOString(),
      };

      // Optional fast win: if game cover is missing and IGDB returned one, store it now
      if (!g?.cover_url && hit?.cover_url) {
        patch.cover_url = hit.cover_url;
      }

      const { error: uErr } = await supabaseAdmin.from("games").update(patch).eq("id", g.id);
      if (uErr) {
        errors.push({ game_id: String(g.id), title: usedTitle, error: uErr.message });
        skipped += 1;
        continue;
      }

      updatedIds += 1;
      if (patch.cover_url) updatedCovers += 1;
    } catch (e: any) {
      errors.push({ game_id: String(g.id), title: canonical, error: e?.message || String(e) });
      skipped += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    processed: rows.length,
    updated_ids: updatedIds,
    updated_covers: updatedCovers,
    skipped,
    errors: errors.slice(0, 25),
    message: `Backfilled IGDB IDs for ${updatedIds} games.`,
  });
}

