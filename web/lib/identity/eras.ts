export type EraKey =
  | "gen1_1972_1977"
  | "gen2_1976_1984"
  | "gen3_1983_1992"
  | "gen4_1987_1996"
  | "gen5a_1993_1996"
  | "gen5b_1996_2001"
  | "gen6_1998_2005"
  | "gen7_2005_2012"
  | "gen8_2013_2019"
  | "gen9_2020_plus"
  | "unknown";

export const ERA_META: Record<EraKey, { label: string; years: string; short: string }> = {
  gen1_1972_1977: { label: "Early Home", years: "1972–1977", short: "Gen 1" },
  gen2_1976_1984: { label: "8-bit Dawn", years: "1976–1984", short: "Gen 2" },
  gen3_1983_1992: { label: "8-bit Golden Age", years: "1983–1992", short: "Gen 3" },
  gen4_1987_1996: { label: "16-bit Era", years: "1987–1992", short: "Gen 4" },
  gen5a_1993_1996: { label: "32-bit Shift", years: "1993–1996", short: "Gen 5 (32)" },
  gen5b_1996_2001: { label: "64-bit + PS1 Peak", years: "1996–2001", short: "Gen 5 (64)" },
  gen6_1998_2005: { label: "PS2 / OG Xbox / GC", years: "1998–2005", short: "Gen 6" },
  gen7_2005_2012: { label: "HD Era (360/PS3/Wii)", years: "2005–2012", short: "Gen 7" },
  gen8_2013_2019: { label: "Always-On Era", years: "2013–2019", short: "Gen 8" },
  gen9_2020_plus: { label: "Modern Era", years: "2020+", short: "Gen 9" },
  unknown: { label: "Unknown", years: "", short: "?" },
};

/** Map legacy bucket keys to canonical genX keys. Never show legacy keys in UI. */
export const LEGACY_ERA_MAP: Record<string, EraKey> = {
  early_arcade_pre_crash: "gen1_1972_1977",
  "8bit_home": "gen2_1976_1984",
  "16bit": "gen4_1987_1996",
  "32_64bit": "gen5b_1996_2001",
  ps2_xbox_gc: "gen6_1998_2005",
  hd_era: "gen7_2005_2012",
  ps4_xbo: "gen8_2013_2019",
  switch_wave: "gen8_2013_2019",
  modern: "gen9_2020_plus",
};

export function toEraKey(key: string): EraKey {
  if (key in ERA_META) return key as EraKey;
  return LEGACY_ERA_MAP[key] ?? "unknown";
}

export function eraLabel(key: string) {
  const n = toEraKey(key);
  return ERA_META[n]?.label ?? n;
}
export function eraYears(key: string) {
  const n = toEraKey(key);
  return ERA_META[n]?.years ?? "";
}

/** Merge era_buckets by canonical key so legacy keys (e.g. ps4_xbo + switch_wave) become one card. */
export function mergeEraBucketsByCanonical(
  buckets: Record<string, { games?: number; releases?: number }> | null | undefined
): Record<string, { games: number; releases: number }> {
  if (!buckets || typeof buckets !== "object") return {};
  const merged: Record<string, { games: number; releases: number }> = {};
  for (const [key, val] of Object.entries(buckets)) {
    const canonical = toEraKey(key);
    if (canonical === "unknown") continue;
    const prev = merged[canonical] ?? { games: 0, releases: 0 };
    merged[canonical] = {
      games: prev.games + Number(val?.games ?? 0),
      releases: prev.releases + Number(val?.releases ?? 0),
    };
  }
  return merged;
}
