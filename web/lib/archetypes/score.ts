/**
 * Archetype scoring — deterministic tiers + reasons.
 */

import type { UserStats, EraKey } from "@/lib/insights/user-stats";
import { getCompletionRate } from "@/lib/insights/user-stats";

export type StrengthTier = "emerging" | "strong" | "core";

export type ArchetypeScore = {
  key: string;
  name: string;
  eligible: boolean;
  score: number; // 0..100
  tier: StrengthTier | null;
  primaryEra?: EraKey;
  reasons: Array<{ label: string; value: string; confidence: "high" | "med" | "low" }>;
};

function tierFromScore(score: number): StrengthTier | null {
  if (score >= 75) return "core";
  if (score >= 55) return "strong";
  if (score >= 30) return "emerging";
  return null;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function topEra(stats: UserStats): EraKey {
  let best: EraKey = "unknown";
  let bestCount = 0;
  for (const [k, v] of Object.entries(stats.eraCounts || {})) {
    const n = Number(v || 0);
    if (n > bestCount) {
      bestCount = n;
      best = k as EraKey;
    }
  }
  return best;
}

function eraDiversity(stats: UserStats, minCount = 10) {
  let c = 0;
  for (const v of Object.values(stats.eraCounts || {})) {
    if (Number(v || 0) >= minCount) c += 1;
  }
  return c;
}

function platformDiversity(stats: UserStats) {
  return Object.values(stats.platformCounts || {}).filter((v) => Number(v || 0) > 0).length;
}

/** --- Archetypes --- */

export function scoreCompletionist(stats: UserStats): ArchetypeScore {
  const completion = getCompletionRate(stats);
  const earned = stats.trophiesEarned + stats.achievementsEarned + stats.raEarned;

  const eligible = earned >= 50 || completion >= 0.25;

  let score = 0;
  score += 40 * completion;
  if (earned >= 250) score += 20;
  if (stats.raEarned >= 50) score += 20;
  if (stats.totalPlaytimeMinutes >= 10_000) score += 20;

  score = clamp(Math.round(score), 0, 100);

  return {
    key: "completionist",
    name: "Completionist",
    eligible,
    score: eligible ? score : 0,
    tier: eligible ? tierFromScore(score) : null,
    reasons: [
      { label: "Completion rate", value: `${Math.round(completion * 100)}%`, confidence: completion > 0 ? "high" : "low" },
      { label: "Earned trophies/achievements", value: String(earned), confidence: earned > 0 ? "high" : "low" },
      { label: "RetroAchievements earned", value: String(stats.raEarned), confidence: "med" },
      { label: "Playtime", value: `${Math.round(stats.totalPlaytimeMinutes / 60)}h`, confidence: stats.totalPlaytimeMinutes > 0 ? "med" : "low" },
    ],
  };
}

export function scoreExplorer(stats: UserStats): ArchetypeScore {
  const eligible = stats.totalReleases >= 50;

  const pdiv = platformDiversity(stats); // 1..N
  const ediv = eraDiversity(stats, 10); // eras with >=10 titles

  let score = 0;
  score += clamp(pdiv * 10, 0, 40);
  score += clamp(ediv * 10, 0, 40);
  if (stats.totalReleases >= 300) score += 20;

  score = clamp(Math.round(score), 0, 100);

  return {
    key: "explorer",
    name: "Explorer",
    eligible,
    score: eligible ? score : 0,
    tier: eligible ? tierFromScore(score) : null,
    reasons: [
      { label: "Library size", value: String(stats.totalReleases), confidence: "high" },
      { label: "Platform diversity", value: `${pdiv} platforms`, confidence: "high" },
      { label: "Era diversity", value: `${ediv} eras`, confidence: "high" },
    ],
  };
}

export function scoreRetroDabbler(stats: UserStats): ArchetypeScore {
  const retroCount =
    (stats.eraCounts.early || 0) +
    (stats.eraCounts.nes || 0) +
    (stats.eraCounts.snes || 0) +
    (stats.eraCounts.ps1 || 0) +
    (stats.eraCounts.ps2 || 0);

  const eligible = retroCount >= 5;

  const share = stats.totalReleases > 0 ? retroCount / stats.totalReleases : 0;

  let score = 0;
  score += 60 * share;
  if (stats.raTotal >= 1) score += 20;
  if (retroCount >= 50) score += 20;

  score = clamp(Math.round(score), 0, 100);

  return {
    key: "retro_dabbler",
    name: "Retro Dabbler",
    eligible,
    score: eligible ? score : 0,
    tier: eligible ? tierFromScore(score) : null,
    reasons: [
      { label: "Retro titles in library", value: String(retroCount), confidence: "high" },
      { label: "Retro share", value: `${Math.round(share * 100)}%`, confidence: "high" },
      { label: "RA coverage", value: stats.raTotal ? `${stats.raTotal} achievements tracked` : "none yet", confidence: "med" },
    ],
  };
}

/** Era identity "archetypes" */
export function scoreEraIdentity(stats: UserStats): ArchetypeScore {
  const era = topEra(stats);
  const count = Number((stats.eraCounts as Record<string, number>)?.[era] || 0);
  const eligible = count >= 10 && era !== "unknown";

  const share = stats.totalReleases > 0 ? count / stats.totalReleases : 0;
  let score = 0;
  score += 70 * share;
  if (count >= 50) score += 30;

  score = clamp(Math.round(score), 0, 100);

  const nameMap: Record<EraKey, string> = {
    early: "Early Home Computing Era Player",
    nes: "NES Era Player",
    snes: "SNES Era Player",
    ps1: "PS1 Era Player",
    ps2: "PS2 Era Player",
    ps3_360: "PS3 / Xbox 360 Era Player",
    wii: "Wii Era Player",
    modern: "Modern Era Player",
    unknown: "Era Player",
  };

  return {
    key: `era_${era}`,
    name: nameMap[era] || "Era Player",
    eligible,
    score: eligible ? score : 0,
    tier: eligible ? tierFromScore(score) : null,
    primaryEra: era,
    reasons: [
      { label: "Primary era", value: era, confidence: "high" },
      { label: "Titles in era", value: String(count), confidence: "high" },
      { label: "Era share", value: `${Math.round(share * 100)}%`, confidence: "high" },
    ],
  };
}

export function computeArchetypes(stats: UserStats) {
  const a = [
    scoreCompletionist(stats),
    scoreExplorer(stats),
    scoreRetroDabbler(stats),
    scoreEraIdentity(stats),
  ].filter((x) => x.eligible && x.tier);

  // Sort by score desc
  a.sort((x, y) => (y.score || 0) - (x.score || 0));

  const primary = a[0] || null;

  return {
    primary_archetype: primary?.key ?? null,
    primary_era: (primary?.primaryEra ?? null) as EraKey | null,
    top: a.slice(0, 3),
    all: a,
  };
}
