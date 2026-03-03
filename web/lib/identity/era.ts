/**
 * Origin-era bucket from game origin year (games.first_release_year or releases.release_date fallback).
 * Non-overlapping generation buckets. Used for timeline cards, standouts, dominance.
 */
export function originBucketFromYear(y: number | null | undefined): string {
  if (y == null || !Number.isFinite(y)) return "unknown";
  const year = Number(y);
  if (year >= 1972 && year <= 1977) return "gen1_1972_1977";
  if (year >= 1978 && year <= 1982) return "gen2_1978_1982";
  if (year >= 1983 && year <= 1989) return "gen3_1983_1989";
  if (year >= 1990 && year <= 1995) return "gen4_1990_1995";
  if (year >= 1996 && year <= 1999) return "gen5_1996_1999";
  if (year >= 2000 && year <= 2005) return "gen6_2000_2005";
  if (year >= 2006 && year <= 2012) return "gen7_2006_2012";
  if (year >= 2013 && year <= 2019) return "gen8_2013_2019";
  if (year >= 2020) return "gen9_2020_plus";
  return "unknown";
}

export const ORIGIN_BUCKET_META: Record<
  string,
  { title: string; sub: string; order: number }
> = {
  gen1_1972_1977: { title: "Gen 1", sub: "Odyssey • Pong clones", order: 1 },
  gen2_1978_1982: { title: "Gen 2", sub: "Atari 2600 • Intellivision", order: 2 },
  gen3_1983_1989: { title: "Gen 3", sub: "NES • Master System • Game Boy", order: 3 },
  gen4_1990_1995: { title: "Gen 4", sub: "SNES • Genesis • TG-16", order: 4 },
  gen5_1996_1999: { title: "Gen 5", sub: "PlayStation • N64 • Saturn", order: 5 },
  gen6_2000_2005: { title: "Gen 6", sub: "PS2 • GameCube • Xbox • Dreamcast", order: 6 },
  gen7_2006_2012: { title: "Gen 7", sub: "Xbox 360 • PS3 • Wii", order: 7 },
  gen8_2013_2019: { title: "Gen 8", sub: "PS4 • Xbox One • Switch", order: 8 },
  gen9_2020_plus: { title: "Gen 9", sub: "PS5 • Series X|S", order: 9 },
  unknown: { title: "Unknown", sub: "Missing release year", order: 999 },
};

export const ORIGIN_BUCKET_ORDER = Object.entries(ORIGIN_BUCKET_META)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([k]) => k);

/** @deprecated Use ORIGIN_BUCKET_ORDER for timeline. */
export const ORIGIN_ORDER = ORIGIN_BUCKET_ORDER;

/** Legacy: era bucket from first_release_year. Prefer originBucketFromYear for timeline. */
export function eraBucketFromYear(y: number | null | undefined): string {
  return originBucketFromYear(y);
}
