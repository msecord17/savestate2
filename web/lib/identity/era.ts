/**
 * Era bucket key from first_release_year. Aligns with get_identity_signals SQL and EraTimeline.
 */
export function eraBucketFromYear(y: number | null | undefined): string {
  if (y == null || !Number.isFinite(y)) return "unknown";
  if (y <= 1979) return "early_arcade_pre_crash";
  if (y >= 1980 && y <= 1989) return "8bit_home";
  if (y >= 1990 && y <= 1995) return "16bit";
  if (y >= 1996 && y <= 2000) return "32_64bit";
  if (y >= 2001 && y <= 2005) return "ps2_xbox_gc";
  if (y >= 2006 && y <= 2012) return "hd_era";
  if (y >= 2013 && y <= 2016) return "ps4_xbo";
  if (y >= 2017 && y <= 2019) return "switch_wave";
  if (y >= 2020) return "modern";
  return "unknown";
}

/** Chronological order of era keys (oldest first). Used for timeline sort. */
export const ERA_ORDER: string[] = [
  "early_arcade_pre_crash",
  "8bit_home",
  "16bit",
  "32_64bit",
  "ps2_xbox_gc",
  "hd_era",
  "ps4_xbo",
  "switch_wave",
  "modern",
  "unknown",
];

export const ERA_LABELS: Record<string, string> = {
  early_arcade_pre_crash: "Atari / Early",
  "8bit_home": "8-bit",
  "16bit": "16-bit",
  "32_64bit": "PS1/N64",
  ps2_xbox_gc: "PS2 era",
  hd_era: "HD era",
  ps4_xbo: "PS4 era",
  switch_wave: "Switch wave",
  modern: "Modern",
  unknown: "Unknown",
};

export const ERA_YEARS: Record<string, string> = {
  early_arcade_pre_crash: "≤1979",
  "8bit_home": "1980–1989",
  "16bit": "1990–1995",
  "32_64bit": "1996–2000",
  ps2_xbox_gc: "2001–2005",
  hd_era: "2006–2012",
  ps4_xbo: "2013–2016",
  switch_wave: "2017–2019",
  modern: "2020+",
  unknown: "—",
};
