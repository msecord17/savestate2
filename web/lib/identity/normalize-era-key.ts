export function normalizeEraKey(key: string | null | undefined): string {
  const k = String(key ?? "").trim();
  if (!k) return "unknown";

  // New canonical keys pass through
  const canonical = [
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
  ];
  if (canonical.includes(k)) return k;

  const legacy: Record<string, string> = {
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

  return legacy[k] ?? (k.startsWith("gen") ? k : "unknown");
}
