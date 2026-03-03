import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ERA_ORDER = [
  "gen1_1972_1977",
  "gen2_1978_1982",
  "gen3_1983_1989",
  "gen4_1990_1995",
  "gen5_1996_1999",
  "gen6_2000_2005",
  "gen7_2006_2012",
  "gen8_2013_2019",
  "gen9_2020_plus",
  "unknown",
] as const;

function bucketFromYear(y: number | null): (typeof ERA_ORDER)[number] {
  if (!y || y <= 0) return "unknown";
  if (y <= 1977) return "gen1_1972_1977";
  if (y <= 1982) return "gen2_1978_1982";
  if (y <= 1989) return "gen3_1983_1989";
  if (y <= 1995) return "gen4_1990_1995";
  if (y <= 1999) return "gen5_1996_1999";
  if (y <= 2005) return "gen6_2000_2005";
  if (y <= 2012) return "gen7_2006_2012";
  if (y <= 2019) return "gen8_2013_2019";
  return "gen9_2020_plus";
}

function extractReleaseId(x: any): string | null {
  return (
    x?.release_id ??
    x?.releaseId ??
    x?.releaseID ??
    x?.id ?? // some clients send release id as `id`
    null
  );
}

function extractYear(x: any): number | null {
  const y =
    x?.year ??
    x?.first_release_year ??
    x?.firstReleaseYear ??
    x?.release_year ??
    null;
  return typeof y === "number" && y > 0 ? y : null;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));

  // Accept multiple input shapes
  const items: any[] =
    (Array.isArray(body?.items) && body.items) ||
    (Array.isArray(body?.selections) && body.selections) ||
    (Array.isArray(body?.games) && body.games) ||
    [];

  const release_ids: string[] = Array.isArray(body?.release_ids)
    ? body.release_ids.filter(Boolean)
    : items.map(extractReleaseId).filter(Boolean);

  // If client already has years for every item, no DB needed
  const yearsFromClient = items.map(extractYear);
  const allHaveYear = items.length > 0 && yearsFromClient.every((y) => typeof y === "number" && y! > 0);

  let years: (number | null)[] = [];

  if (allHaveYear) {
    years = yearsFromClient;
  } else if (release_ids.length) {
    const { data, error } = await supabaseServer
      .from("platform_library_entries")
      .select("release_id, release_year")
      .in("release_id", release_ids);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const byId = new Map<string, number | null>(
      (data ?? []).map((r: any) => [r.release_id, r.release_year ?? null])
    );

    years = release_ids.map((id) => byId.get(id) ?? null);
  } else {
    // Helpful debug so you can see what the caller sent
    return NextResponse.json(
      {
        ok: false,
        error: "items with release_id or year required",
        debug: {
          got_items: Array.isArray(body?.items),
          got_selections: Array.isArray(body?.selections),
          got_release_ids: Array.isArray(body?.release_ids),
          sample_item_keys: items?.[0] ? Object.keys(items[0]) : [],
        },
      },
      { status: 400 }
    );
  }

  const counts: Record<string, number> = {};
  for (const k of ERA_ORDER) counts[k] = 0;

  for (const y of years) {
    const b = bucketFromYear(y);
    counts[b] = (counts[b] ?? 0) + 1;
  }

  const era_distribution = ERA_ORDER.map((k) => ({ key: k, count: counts[k] ?? 0 }))
    .filter((b) => b.count > 0);

  const top_bucket = era_distribution.slice().sort((a, b) => b.count - a.count)[0]?.key ?? "unknown";

  return NextResponse.json({
    ok: true,
    era_distribution,
    top_bucket,
    total: years.length,
  });
}
