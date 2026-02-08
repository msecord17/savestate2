/**
 * Origin-era bucket from game origin year (games.first_release_year or releases.release_date fallback).
 * Numbered generations with Gen 5 split (5a = 32-bit dawn, 5b = 64-bit wave).
 * First-match order matches SQL; used for timeline cards, standouts, dominance.
 */
export function originBucketFromYear(y: number | null | undefined): string {
  if (y == null || !Number.isFinite(y)) return "unknown";
  const year = Number(y);
  if (year >= 1972 && year <= 1977) return "gen1_1972_1977";
  if (year >= 1976 && year <= 1984) return "gen2_1976_1984";
  if (year >= 1983 && year <= 1992) return "gen3_1983_1992";
  if (year >= 1987 && year <= 1992) return "gen4_1987_1996";
  if (year >= 1993 && year <= 1996) return "gen5a_1993_1996";
  if (year >= 1996 && year <= 2001) return "gen5b_1996_2001";
  if (year >= 1998 && year <= 2005) return "gen6_1998_2005";
  if (year >= 2005 && year <= 2012) return "gen7_2005_2012";
  if (year >= 2013 && year <= 2019) return "gen8_2013_2019";
  if (year >= 2020) return "gen9_2020_plus";
  return "unknown";
}

/** Chronological order of origin-era keys (oldest first). */
export const ORIGIN_ORDER: string[] = [
  "gen1_1972_1977",
  "gen2_1976_1984",
  "gen3_1983_1992",
  "gen4_1987_1996",
  "gen5a_1993_1996",
  "gen5b_1996_2001",
  "gen6_1998_2005",
  "gen7_2005_2012",
  "gen8_2013_2019",
  "gen9_2020_plus",
  "unknown",
];

export const ORIGIN_LABELS: Record<string, string> = {
  gen1_1972_1977: "Gen 1 · First home / Pong",
  gen2_1976_1984: "Gen 2 · 8-bit cartridge",
  gen3_1983_1992: "Gen 3 · NES era",
  gen4_1987_1996: "Gen 4 · 16-bit wars",
  gen5a_1993_1996: "Gen 5a · 32-bit dawn",
  gen5b_1996_2001: "Gen 5b · 64-bit wave",
  gen6_1998_2005: "Gen 6 · PS2 / OG Xbox / GC",
  gen7_2005_2012: "Gen 7 · HD era",
  gen8_2013_2019: "Gen 8 · PS4 / Xbox One / Switch",
  gen9_2020_plus: "Gen 9 · PS5 / Series / modern",
  unknown: "Unknown",
};

export const ORIGIN_YEARS: Record<string, string> = {
  gen1_1972_1977: "1972–1977",
  gen2_1976_1984: "1976–1984",
  gen3_1983_1992: "1983–1992",
  gen4_1987_1996: "1987–1992",
  gen5a_1993_1996: "1993–1996",
  gen5b_1996_2001: "1996–2001",
  gen6_1998_2005: "1998–2005",
  gen7_2005_2012: "2005–2012",
  gen8_2013_2019: "2013–2019",
  gen9_2020_plus: "2020+",
  unknown: "—",
};

/** Legacy: era bucket from first_release_year (old mapping). Prefer originBucketFromYear for timeline. */
export function eraBucketFromYear(y: number | null | undefined): string {
  return originBucketFromYear(y);
}

/** @deprecated Use ORIGIN_ORDER for timeline. */
export const ERA_ORDER: string[] = ORIGIN_ORDER;

/** @deprecated Use ORIGIN_LABELS for timeline. */
export const ERA_LABELS: Record<string, string> = ORIGIN_LABELS;

/** @deprecated Use ORIGIN_YEARS for timeline. */
export const ERA_YEARS: Record<string, string> = ORIGIN_YEARS;
