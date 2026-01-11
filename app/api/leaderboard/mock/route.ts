import { NextResponse } from "next/server";

type Row = {
  user_id: string;
  display_name: string;
  score: number;
  era_snes_score: number; // fake “SNES-era” score
};

// Small deterministic helper so the list looks “real” but stable.
function seededJitter(i: number) {
  const x = Math.sin(i * 999) * 10000;
  return x - Math.floor(x);
}

function buildFakeLeaderboard(myUserId: string) {
  const names = [
    "MiloTheMinMaxer",
    "CRTShogun",
    "AnalogWizard",
    "DiscSwapHero",
    "JRPGArchivist",
    "PixelPaladin",
    "SpeedrunGremlin",
    "BossFightTherapist",
    "CartridgeCartel",
    "SaveScummer",
    "ROMRanger",
    "AchievementGoblin",
    "RetroNomad",
    "FramePerfect",
    "MenuMancer",
    "CloudSaveWanderer",
    "TrophyFarmer",
    "MapperOfMaps",
    "TheBacklogBaron",
    "BitDepthBard",
  ];

  // Generate 80-ish fake users
  const rows: Row[] = [];
  const total = 80;

  for (let i = 0; i < total; i++) {
    const base = 4500 - i * 42; // descending-ish
    const noise = Math.round(seededJitter(i) * 120);
    const score = Math.max(250, base + noise);

    // Era score tends to be smaller and “specialized”
    const era = Math.round(score * (0.25 + seededJitter(i + 7) * 0.35));

    rows.push({
      user_id: `fake-${i}`,
      display_name: names[i % names.length] + (i >= names.length ? `_${i}` : ""),
      score,
      era_snes_score: era,
    });
  }

  // Insert “you” somewhere mid-high with a strong SNES tilt
  // (Adjust these numbers if you want a different vibe.)
  rows.push({
    user_id: myUserId,
    display_name: "You",
    score: 3275,
    era_snes_score: 1550,
  });

  // Sort global
  const global = [...rows].sort((a, b) => b.score - a.score);

  // Sort SNES-era
  const snes = [...rows].sort((a, b) => b.era_snes_score - a.era_snes_score);

  return { global, snes };
}

function percentileFromRank(rank1Based: number, total: number) {
  // “Top X%” where rank 1 => Top 1.25% if total=80, etc.
  const pct = (rank1Based / total) * 100;
  return Math.max(0.1, Math.min(100, pct));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const myUserId = url.searchParams.get("user_id") || "me";

  const { global, snes } = buildFakeLeaderboard(myUserId);

  const total = global.length;

  const myGlobalRank = global.findIndex((r) => r.user_id === myUserId) + 1;
  const mySnesRank = snes.findIndex((r) => r.user_id === myUserId) + 1;

  const myGlobalPercent = percentileFromRank(myGlobalRank, total);
  const mySnesPercent = percentileFromRank(mySnesRank, total);

  // Slice a “window” around you for nicer display (but also return top list)
  const myIdx = myGlobalRank - 1;
  const start = Math.max(0, myIdx - 3);
  const end = Math.min(total, myIdx + 4);

  return NextResponse.json({
    ok: true,
    total_users: total,

    me: {
      user_id: myUserId,
      global_rank: myGlobalRank,
      global_top_percent: Number(myGlobalPercent.toFixed(1)),
      snes_rank: mySnesRank,
      snes_top_percent: Number(mySnesPercent.toFixed(1)),
    },

    global_top: global.slice(0, 20),
    global_window: global.slice(start, end),

    snes_top: snes.slice(0, 20),
  });
}
