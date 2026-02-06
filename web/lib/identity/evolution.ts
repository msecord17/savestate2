export type Evolution = {
  tag: string; // 5–7 words
  icon: string; // icon key (not emoji) e.g. "arrowUpRight"
  note?: string; // 1 short sentence for drawer
  confidence: number; // 0..1
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Minimal, reliable evolution: uses two snapshots (early vs recent) if available.
 * If you don't have time-series yet, we do "inferred evolution" with lower confidence.
 */
export function computeEvolution(input: {
  // If you have real history:
  early?: { completion?: number; exploration?: number; curation?: number; handheld?: number };
  recent?: { completion?: number; exploration?: number; curation?: number; handheld?: number };

  // If you only have current signals:
  current?: {
    completion?: number;
    playEvidence?: number;
    curation?: number;
    eraBreadth?: number;
    platformDiversity?: number;
  };

  primaryEra?: string | null;
  primaryArchetype?: string | null;
}): Evolution | null {
  const early = input.early;
  const recent = input.recent;

  // Real evolution path (preferred)
  if (early && recent) {
    const dCompletion = (recent.completion ?? 0) - (early.completion ?? 0);
    const dCuration = (recent.curation ?? 0) - (early.curation ?? 0);
    const dExploration = (recent.exploration ?? 0) - (early.exploration ?? 0);

    if (dCompletion > 0.18) {
      return {
        tag: "More finisher energy lately",
        icon: "checkCircle",
        note: "Recent activity skews more completion-heavy than your early years.",
        confidence: 0.85,
      };
    }
    if (dExploration > 0.18) {
      return {
        tag: "You're sampling wider than before",
        icon: "compass",
        note: "Recent activity spreads across more genres and releases.",
        confidence: 0.85,
      };
    }
    if (dCuration > 0.18) {
      return {
        tag: "Your library is getting curated",
        icon: "sparkles",
        note: "You're organizing taste more than you used to.",
        confidence: 0.8,
      };
    }

    return {
      tag: "Stable taste, deeper conviction",
      icon: "anchor",
      note: "Your signals are consistent over time—strong identity, not noise.",
      confidence: 0.7,
    };
  }

  // Inferred evolution (fallback)
  const cur = input.current ?? {};
  const completion = clamp01(cur.completion ?? 0);
  const curation = clamp01(cur.curation ?? 0);
  const playEvidence = clamp01(cur.playEvidence ?? 0);
  const eraBreadth = clamp01(cur.eraBreadth ?? 0);
  const platformMix = clamp01(cur.platformDiversity ?? 0);

  // Don't overclaim; keep confidence lower.
  if (playEvidence > 0.75 && completion > 0.6) {
    return {
      tag: "From dabbling → finishing streaks",
      icon: "arrowUpRight",
      note: "Your recent signals suggest a more completion-driven mode.",
      confidence: 0.55,
    };
  }
  if (platformMix > 0.7 && eraBreadth > 0.6) {
    return {
      tag: "You've widened your gaming palette",
      icon: "layers",
      note: "You span multiple platforms and eras—broad curiosity.",
      confidence: 0.55,
    };
  }
  if (curation > 0.5) {
    return {
      tag: "Your taste is getting intentional",
      icon: "bookmark",
      note: "Curation signals point to more deliberate collecting and sorting.",
      confidence: 0.5,
    };
  }

  return {
    tag: "Identity still forming (early days)",
    icon: "seedling",
    note: "We'll refine this as more signals come in.",
    confidence: 0.45,
  };
}
