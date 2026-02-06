/**
 * Identity > Activity > Inventory.
 * Derives a gamer profile from aggregated signals. No DB — callers pass pre-aggregated data.
 * Output is plain-language labels for Gamer Identity Card, Era Fingerprint, and Play Style.
 */

export type GamerSignals = {
  /** Platform keys present in portfolio (e.g. psn, steam, xbox, retroachievements). */
  platforms: string[];
  /** Game release years (first_release_year) — used for era distribution. */
  releaseYears: number[];
  /** Total trophies earned (PSN + RA). */
  trophyCount?: number;
  /** Xbox achievements earned. */
  achievementCount?: number;
  /** RA achievements (hardcore-weighted in completion signal). */
  raEarned?: number;
  /** Total playtime hours (Steam + Xbox where available). */
  playtimeHours?: number;
  /** Count of games with any completion/achievement progress. */
  gamesWithProgress: number;
  /** Total games in portfolio. */
  gamesOwned: number;
};

export type EraFingerprint = {
  dominantEra: string;
  labels: string[];
  distribution: { era: string; weight: number }[];
};

export type PlayStyle = "completion" | "exploration" | "balanced";

export type GamerArchetype =
  | "cross_platform_veteran"
  | "era_spanning_player"
  | "completionist"
  | "explorer"
  | "retro_dabbler"
  | "modern_first"
  | "steam_heavy_strategist";

/** Aggregated signals used for archetype derivation (computed from GamerSignals). */
export type AggregatedSignals = {
  platformsConnected: number;
  activePlatforms: number;
  erasCovered: number;
  completionRatio: number;
  completedGames: number;
  librarySize: number;
  hasRetroSignals: boolean;
  modernEraRatio: number;
};

export type GamerProfile = {
  archetype: string;
  archetypeId: GamerArchetype;
  eraFingerprint: EraFingerprint;
  playStyle: PlayStyle;
};

// --- Machine-readable archetype shape (for rules, copy, and future derivation) ---

export type SignalRule = {
  signal: string;
  op: ">=" | "<=" | ">" | "<" | "==" | "!=";
  value: number;
};

export type SignalWeight = {
  signal: string;
  weight: number;
};

export type ArchetypeFamily = "play" | "taste" | "collector" | "hybrid";

export type Archetype = {
  key: string;
  family: ArchetypeFamily;
  eligibility: SignalRule[];
  strength: SignalWeight[];
  allowsCollectorSignals: boolean;
  copyVerbs: {
    primary: string[];
    inference: string[];
  };
};

/** Evaluate eligibility: all rules must pass against the signal bag. */
export function evaluateEligibility(rules: SignalRule[], signals: Record<string, number>): boolean {
  for (const r of rules) {
    const v = signals[r.signal] ?? 0;
    const ok =
      (r.op === ">=" && v >= r.value) ||
      (r.op === "<=" && v <= r.value) ||
      (r.op === ">" && v > r.value) ||
      (r.op === "<" && v < r.value) ||
      (r.op === "==" && v === r.value) ||
      (r.op === "!=" && v !== r.value);
    if (!ok) return false;
  }
  return true;
}

/** Compute strength score from weights and signal bag (0..1). */
export function evaluateStrength(weights: SignalWeight[], signals: Record<string, number>): number {
  if (weights.length === 0) return 0;
  let score = 0;
  for (const w of weights) {
    const v = signals[w.signal] ?? 0;
    score += v * w.weight;
  }
  return Math.min(1, Math.max(0, score));
}

/** Example: collector-family archetype (machine-readable). */
export const ARCHETYPE_ARCHIVIST: Archetype = {
  key: "archivist",
  family: "collector",
  eligibility: [
    { signal: "ownership_count", op: ">=", value: 200 },
    { signal: "curation_depth", op: ">=", value: 20 },
  ],
  strength: [
    { signal: "organization_fields", weight: 0.4 },
    { signal: "variant_count", weight: 0.3 },
    { signal: "acquisition_years", weight: 0.3 },
  ],
  allowsCollectorSignals: true,
  copyVerbs: {
    primary: ["curate", "organize", "preserve"],
    inference: ["appears to", "based on your collection"],
  },
};

const ERA_BUCKETS: { key: string; label: string; from: number; to: number }[] = [
  { key: "retro", label: "Retro", from: 0, to: 1994 },
  { key: "90s", label: "90s", from: 1995, to: 1999 },
  { key: "2000s", label: "2000s", from: 2000, to: 2005 },
  { key: "hd", label: "HD era", from: 2006, to: 2012 },
  { key: "modern", label: "Modern", from: 2013, to: 9999 },
];

function bucketYears(years: number[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of ERA_BUCKETS.map((b) => b.key)) counts.set(key, 0);
  for (const y of years) {
    if (!Number.isFinite(y)) continue;
    for (const b of ERA_BUCKETS) {
      if (y >= b.from && y <= b.to) {
        counts.set(b.key, (counts.get(b.key) ?? 0) + 1);
        break;
      }
    }
  }
  return counts;
}

function deriveEraFingerprint(releaseYears: number[]): EraFingerprint {
  const counts = bucketYears(releaseYears);
  const total = releaseYears.filter(Number.isFinite).length;
  const distribution = ERA_BUCKETS.map((b) => ({
    era: b.label,
    weight: total ? (counts.get(b.key) ?? 0) / total : 0,
  })).filter((d) => d.weight > 0);

  const sorted = [...distribution].sort((a, b) => b.weight - a.weight);
  const dominantEra = sorted[0]?.era ?? "Modern";
  const labels: string[] = [];
  if (sorted.some((d) => d.era === "Retro" && d.weight > 0)) labels.push("Retro-curious");
  if (sorted.some((d) => d.era === "90s" && d.weight > 0.2)) labels.push("90s kid");
  if (sorted.some((d) => d.era === "2000s" && d.weight > 0.2)) labels.push("2000s era");
  if (sorted.some((d) => d.era === "HD era" && d.weight > 0.2)) labels.push("HD era mainstay");
  if (sorted.some((d) => d.era === "Modern" && d.weight > 0.3)) labels.push("Modern-first");
  if (labels.length === 0) labels.push(dominantEra);

  return { dominantEra, labels, distribution };
}

function derivePlayStyle(signals: GamerSignals): PlayStyle {
  const { gamesWithProgress, gamesOwned, raEarned = 0 } = signals;
  if (gamesOwned === 0) return "balanced";
  const ratio = gamesWithProgress / gamesOwned;
  const raWeight = Math.min(1, raEarned / 500);
  const completionScore = ratio * (1 + raWeight * 0.5);
  if (completionScore >= 0.6) return "completion";
  if (completionScore <= 0.25) return "exploration";
  return "balanced";
}

/** Build AggregatedSignals from raw GamerSignals (platforms, release years, completion counts). */
export function aggregateSignals(signals: GamerSignals): AggregatedSignals {
  const counts = bucketYears(signals.releaseYears ?? []);
  const totalYears = signals.releaseYears?.filter(Number.isFinite).length ?? 0;
  const erasCovered = ERA_BUCKETS.filter((b) => (counts.get(b.key) ?? 0) > 0).length;
  const retroCount = (counts.get("retro") ?? 0) + (counts.get("90s") ?? 0);
  const modernCount = counts.get("modern") ?? 0;
  const completionRatio = signals.gamesOwned > 0 ? signals.gamesWithProgress / signals.gamesOwned : 0;
  const modernEraRatio = totalYears > 0 ? modernCount / totalYears : 0;

  return {
    platformsConnected: signals.platforms?.length ?? 0,
    activePlatforms: signals.platforms?.length ?? 0,
    erasCovered,
    completionRatio,
    completedGames: signals.gamesWithProgress,
    librarySize: signals.gamesOwned,
    hasRetroSignals: totalYears > 0 && retroCount > 0,
    modernEraRatio,
  };
}

const COMPLETIONIST_THRESHOLD = 10;
const EXPLORER_LIBRARY_MIN = 25;
const EXPLORER_COMPLETION_MAX = 0.15;

export const ARCHETYPE_LABELS: Record<GamerArchetype, string> = {
  cross_platform_veteran: "Cross-Platform Veteran",
  era_spanning_player: "Era-Spanning Player",
  completionist: "Completionist",
  explorer: "Explorer",
  retro_dabbler: "Retro Dabbler",
  modern_first: "Modern-First",
  steam_heavy_strategist: "Steam-Heavy Strategist",
};

function deriveArchetype(signals: AggregatedSignals): GamerArchetype {
  if (signals.platformsConnected >= 3 && signals.activePlatforms >= 2) return "cross_platform_veteran";
  if (signals.erasCovered >= 3) return "era_spanning_player";
  if (signals.completionRatio >= 0.3 || signals.completedGames >= COMPLETIONIST_THRESHOLD) return "completionist";
  if (signals.librarySize >= EXPLORER_LIBRARY_MIN && signals.completionRatio < EXPLORER_COMPLETION_MAX) return "explorer";
  if (signals.hasRetroSignals) return "retro_dabbler";
  if (signals.modernEraRatio >= 0.7) return "modern_first";
  return "steam_heavy_strategist";
}

/**
 * Derive gamer profile from aggregated signals.
 * Expose the label, not the math.
 */
export function deriveGamerProfile(signals: GamerSignals): GamerProfile {
  const aggregated = aggregateSignals(signals);
  const playStyle = derivePlayStyle(signals);
  const eraFingerprint = deriveEraFingerprint(signals.releaseYears ?? []);
  const archetypeId = deriveArchetype(aggregated);
  const archetype = ARCHETYPE_LABELS[archetypeId];
  return { archetype, archetypeId, eraFingerprint, playStyle };
}
