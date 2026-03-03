import { ORIGIN_BUCKET_META } from "@/lib/identity/era";

/** Back-compat: { label, years } for API consumers. label=title, years=sub. */
export const ERA_META: Record<string, { label: string; years: string }> = Object.fromEntries(
  Object.entries(ORIGIN_BUCKET_META).map(([k, v]) => [k, { label: v.title, years: v.sub }])
);

export type EraKey =
  | "gen1_1972_1977"
  | "gen2_1978_1982"
  | "gen3_1983_1989"
  | "gen4_1990_1995"
  | "gen5_1996_1999"
  | "gen6_2000_2005"
  | "gen7_2006_2012"
  | "gen8_2013_2019"
  | "gen9_2020_plus"
  | "unknown";

/** Map legacy bucket keys to canonical genX keys. Never show legacy keys in UI. */
export const LEGACY_ERA_MAP: Record<string, EraKey> = {
  early_arcade_pre_crash: "gen1_1972_1977",
  gen2_1976_1984: "gen2_1978_1982",
  "8bit_home": "gen3_1983_1989",
  gen3_1983_1992: "gen3_1983_1989",
  gen4_1987_1996: "gen4_1990_1995",
  "16bit": "gen4_1990_1995",
  gen5a_1993_1996: "gen5_1996_1999",
  gen5b_1996_2001: "gen5_1996_1999",
  "32_64bit": "gen5_1996_1999",
  gen6_1998_2005: "gen6_2000_2005",
  ps2_xbox_gc: "gen6_2000_2005",
  gen7_2005_2012: "gen7_2006_2012",
  hd_era: "gen7_2006_2012",
  ps4_xbo: "gen8_2013_2019",
  switch_wave: "gen8_2013_2019",
  modern: "gen9_2020_plus",
};

export function toEraKey(key: string): EraKey {
  if (key in ORIGIN_BUCKET_META) return key as EraKey;
  return LEGACY_ERA_MAP[key] ?? "unknown";
}

/** Primary label (title) for era bucket. */
export function eraLabel(key: string) {
  const n = toEraKey(key);
  return ORIGIN_BUCKET_META[n]?.title ?? n;
}

/** Secondary label (sub) for era bucket — platforms/consoles, not year range. */
export function eraYears(key: string) {
  const n = toEraKey(key);
  return ORIGIN_BUCKET_META[n]?.sub ?? "—";
}

/** Merge era_buckets by canonical key so legacy keys become one card. */
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
