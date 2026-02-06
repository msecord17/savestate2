/**
 * Collector archetypes computed from identity_signals only (no play/trophy required).
 * Gates + strength tiers (emerging/strong/core). Used by /api/identity/summary.
 */

export type Strength = "emerging" | "strong" | "core";

export function strengthTier(score: number): Strength {
  if (score >= 80) return "core";
  if (score >= 55) return "strong";
  return "emerging";
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return part / total;
}

function topKeyBy<T extends Record<string, number>>(m: T): { key: string | null; value: number } {
  let bestK: string | null = null;
  let bestV = -Infinity;
  for (const [k, v] of Object.entries(m)) {
    if (v > bestV) {
      bestV = v;
      bestK = k;
    }
  }
  return { key: bestK, value: bestV };
}

const ERA_LABELS: Record<string, string> = {
  early_arcade_pre_crash: "Atari / Early",
  "8bit_home": "8-bit",
  "16bit": "16-bit",
  "32_64bit": "PS1 / N64",
  ps2_xbox_gc: "PS2 era",
  hd_era: "PS3 / 360",
  ps4_xbo: "PS4 era",
  switch_wave: "Switch wave",
  modern: "Modern",
};

export type CollectorArchetype = {
  key: string;
  label: string;
  strength: Strength;
  score: number;
  reasons: string[];
  meta?: Record<string, unknown>;
  verbs?: string[];
};

/**
 * Compute collector archetypes from identity_signals (library spine only).
 * Returns array with { key, label, strength, score, reasons[] }.
 * platformCounts: optional Record<platform_key, count> for Platform Loyalist; pass {} if not available.
 */
export function computeCollectorArchetypes(
  identity: { identity_signals?: Record<string, unknown> } | null,
  platformCounts?: Record<string, number>
): CollectorArchetype[] {
  const s = identity?.identity_signals || {};
  const ownedGames = Number(s.owned_games ?? 0);
  const ownedReleases = Number(s.owned_releases ?? 0);
  const uniquePlatforms = Number(s.unique_platforms ?? 0);

  const eras: Record<string, number> = {};
  const eraBuckets = (s.era_buckets || {}) as Record<string, { games: number; releases: number }>;
  for (const [k, v] of Object.entries(eraBuckets)) {
    eras[k] = Number((v as { games?: number })?.games ?? 0);
  }

  const platforms = platformCounts ?? {};
  const archetypes: CollectorArchetype[] = [];

  // 1) Archivist — Gate: at least 120 owned games OR 160 owned releases
  if (ownedGames >= 120 || ownedReleases >= 160) {
    const sizeScore = Math.min(100, Math.round((ownedGames / 600) * 100));
    const breadthScore = Math.min(100, Math.round((uniquePlatforms / 8) * 100));
    const score = Math.round(sizeScore * 0.75 + breadthScore * 0.25);

    archetypes.push({
      key: "archivist",
      label: "Archivist",
      strength: strengthTier(score),
      score,
      reasons: [
        `${ownedGames} owned games`,
        uniquePlatforms ? `${uniquePlatforms} platforms` : null,
      ].filter(Boolean) as string[],
      verbs: ["collect", "catalog", "curate"],
    });
  }

  // 2) Era Keeper — Gate: at least 80 owned games AND top era share >= 45%
  if (ownedGames >= 80) {
    const { key: topEra, value: topEraGames } = topKeyBy(eras);
    const share = pct(topEraGames || 0, ownedGames);
    if (topEra && share >= 0.45) {
      const concentrationScore = Math.min(100, Math.round(((share - 0.45) / 0.35) * 100));
      const volumeScore = Math.min(100, Math.round((ownedGames / 400) * 100));
      const score = Math.round(concentrationScore * 0.65 + volumeScore * 0.35);

      archetypes.push({
        key: "era_keeper",
        label: "Era Keeper",
        strength: strengthTier(score),
        score,
        meta: { era: topEra, era_label: ERA_LABELS[topEra] || topEra, share },
        reasons: [
          `${Math.round(share * 100)}% of your library in ${ERA_LABELS[topEra] || topEra}`,
        ],
        verbs: ["collect", "preserve", "specialize"],
      });
    }
  }

  // 3) Platform Loyalist — Gate: at least 80 owned games AND top platform share >= 55%
  if (ownedGames >= 80 && Object.keys(platforms).length > 0) {
    const { key: topPlatform, value: topPlatformCount } = topKeyBy(platforms);
    const share = pct(topPlatformCount || 0, ownedGames);
    if (topPlatform && share >= 0.55) {
      const concentrationScore = Math.min(100, Math.round(((share - 0.55) / 0.3) * 100));
      const volumeScore = Math.min(100, Math.round((ownedGames / 400) * 100));
      const score = Math.round(concentrationScore * 0.7 + volumeScore * 0.3);

      archetypes.push({
        key: "platform_loyalist",
        label: "Platform Loyalist",
        strength: strengthTier(score),
        score,
        meta: { platform: topPlatform, share },
        reasons: [
          `${Math.round(share * 100)}% of your library is on ${String(topPlatform).toUpperCase()}`,
        ],
        verbs: ["collect", "commit", "specialize"],
      });
    }
  }

  return archetypes.sort((a, b) => b.score - a.score);
}
