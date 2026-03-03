import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 36;

type Cursor = { sort_title: string; release_id: string };

function decodeCursor(cur: string | null): Cursor | null {
  if (!cur) return null;
  try {
    const json = Buffer.from(cur, "base64").toString("utf8");
    const o = JSON.parse(json);
    if (o?.sort_title && o?.release_id) return o;
  } catch {}
  return null;
}

function encodeCursor(o: Cursor) {
  return Buffer.from(JSON.stringify(o), "utf8").toString("base64");
}

const ERA_RANGES: Record<string, { start: number; end: number }> = {
  gen1_1972_1977: { start: 1972, end: 1977 },
  gen2_1978_1982: { start: 1978, end: 1982 },
  gen3_1983_1989: { start: 1983, end: 1989 },
  gen4_1990_1995: { start: 1990, end: 1995 },
  gen5_1996_1999: { start: 1996, end: 1999 },
  gen6_2000_2005: { start: 2000, end: 2005 },
  gen7_2006_2012: { start: 2006, end: 2012 },
  gen8_2013_2019: { start: 2013, end: 2019 },
  gen9_2020_plus: { start: 2020, end: 2100 },
  unknown: { start: 0, end: 2100 },
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const era = (url.searchParams.get("era") ?? "all").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 72);
  const cursor = decodeCursor(url.searchParams.get("cursor"));

  let query = supabaseServer
    .from("platform_library_entries")
    .select("release_id, game_id, title, release_year, cover_url, sort_title, platform_key")
    .order("sort_title", { ascending: true })
    .order("release_id", { ascending: true })
    .limit(limit);

  // Search (v1): ilike title. Good enough for alpha.
  if (q.length >= 2) {
    query = query.ilike("title", `%${q}%`);
  }

  // Era filter based on release_year range
  if (era !== "all" && ERA_RANGES[era]) {
    const r = ERA_RANGES[era];
    query = query.gte("release_year", r.start).lte("release_year", r.end);
  }

  // Keyset cursor using sort_title (already normalized) + release_id
  if (cursor) {
    query = query.or(
      `sort_title.gt.${cursor.sort_title},and(sort_title.eq.${cursor.sort_title},release_id.gt.${cursor.release_id})`
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const nextCursor =
    rows.length === limit
      ? encodeCursor({ sort_title: rows[rows.length - 1].sort_title, release_id: rows[rows.length - 1].release_id })
      : null;

  return NextResponse.json({
    ok: true,
    items: rows.map((r: any) => ({
      game_id: r.game_id,
      release_id: r.release_id,
      title: r.title,
      cover_url: r.cover_url ?? null,
      year: r.release_year ?? null,
      first_release_year: r.release_year ?? null,
      platform_key: r.platform_key ?? null,
    })),
    nextCursor,
  });
}
