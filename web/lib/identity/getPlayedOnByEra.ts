type PlayedOnTopDevice = {
  hardware_id: string;
  slug: string;
  display_name: string;
  kind: string | null;
  era_key: string | null;
  is_modern_retro_handheld: boolean;
  releases: number;
  manual: number;
  auto: number;
  source: "manual" | "auto";
};

export type PlayedOnEraSummary = {
  total_releases: number;
  top_device: {
    slug: string;
    display_name: string;
    kind: string | null;
    era_key: string | null;
    releases: number;
    source: "manual" | "auto";
  } | null;
  top_devices: PlayedOnTopDevice[];
  by_kind: Record<string, number>;
  handheld_share: number;
};

function yearFromRow(r: any): number | null {
  const candidates = [
    r?.first_release_year,
    r?.release_year,
    r?.year,
  ].filter((v) => typeof v === "number" && v > 0);

  if (candidates.length) return candidates[0];

  const dateCandidates = [
    r?.first_release_date,
    r?.release_date,
    r?.released_at,
    r?.released_on,
  ].filter((v) => typeof v === "string" && v.length >= 4);

  if (dateCandidates.length) {
    const y = new Date(dateCandidates[0]).getUTCFullYear();
    return Number.isFinite(y) ? y : null;
  }

  return null;
}

function eraKeyForYear(y: number | null): string {
  if (!y) return "unknown";
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

export async function getPlayedOnByEra(
  db: any,
  userId: string,
  limitDevices = 3
): Promise<Record<string, PlayedOnEraSummary>> {
  // 1) played-on rows (no release join)
  const { data: rows, error: rowsErr } = await db
    .from("user_release_played_on")
    .select(`
      release_id,
      source,
      hardware:hardware_id(id, slug, display_name, kind, era_key, is_modern_retro_handheld),
      is_primary
    `)
    .eq("user_id", userId)
    .eq("is_primary", true);

  if (rowsErr) throw rowsErr;

  const clean = (rows ?? []).filter((r: any) => r?.release_id && r?.hardware?.id);
  const releaseIds = [...new Set(clean.map((r: any) => r.release_id))];

  if (!releaseIds.length) return {};

  // 2) fetch releases
  const { data: releases, error: relErr } = await db
    .from("releases")
    .select("*")
    .in("id", releaseIds);

  if (relErr) throw relErr;

  const releaseById = new Map<string, any>((releases ?? []).map((r: any) => [r.id, r]));
  const gameIds = [...new Set((releases ?? []).map((r: any) => r.game_id).filter(Boolean))];

  // 3) fetch games (for first_release_date if releases don't have it)
  let gameById = new Map<string, any>();
  if (gameIds.length) {
    const { data: games, error: gErr } = await db.from("games").select("*").in("id", gameIds);
    if (gErr) throw gErr;
    gameById = new Map<string, any>((games ?? []).map((g: any) => [g.id, g]));
  }

  // 4) now bucket by inferred era
  const perEra = new Map<string, any>();

  for (const r of clean) {
    const rel = releaseById.get(r.release_id);
    const game = rel?.game_id ? gameById.get(rel.game_id) : null;

    const y = yearFromRow(rel) ?? yearFromRow(game);
    const eraKey = eraKeyForYear(y);

    const bucket =
      perEra.get(eraKey) ??
      { total: 0, by_kind: {}, perDevice: new Map<string, any>() };

    bucket.total += 1;

    const hw = r.hardware;
    const kind = (hw.kind ?? "other") as string;
    bucket.by_kind[kind] = (bucket.by_kind[kind] ?? 0) + 1;

    const cur =
      bucket.perDevice.get(hw.id) ??
      {
        hardware_id: hw.id,
        slug: hw.slug,
        display_name: hw.display_name,
        kind: hw.kind ?? null,
        era_key: hw.era_key ?? null,
        is_modern_retro_handheld: !!hw.is_modern_retro_handheld,
        releases: 0,
        manual: 0,
        auto: 0,
        source: "auto" as const,
      };

    cur.releases += 1;
    if (r.source === "manual") cur.manual += 1;
    else cur.auto += 1;
    cur.source = cur.manual > 0 ? "manual" : "auto";

    bucket.perDevice.set(hw.id, cur);
    perEra.set(eraKey, bucket);
  }

  const out: Record<string, PlayedOnEraSummary> = {};
  for (const [eraKey, b] of perEra.entries()) {
    const top_devices = [...b.perDevice.values()]
      .sort((a, c) => c.releases - a.releases)
      .slice(0, Math.max(1, Math.min(limitDevices, 10)));

    const top0 = top_devices[0] ?? null;
    const handheld = b.by_kind["handheld"] ?? 0;
    const handheld_share = b.total > 0 ? handheld / b.total : 0;

    out[eraKey] = {
      total_releases: b.total,
      top_device: top0
        ? {
            slug: top0.slug,
            display_name: top0.display_name,
            kind: top0.kind,
            era_key: top0.era_key,
            releases: top0.releases,
            source: top0.source,
          }
        : null,
      top_devices,
      by_kind: b.by_kind,
      handheld_share,
    };
  }

  return out;
}
