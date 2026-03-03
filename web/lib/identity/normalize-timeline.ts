import { normalizeEraKeyToTimeline } from "@/lib/identity/era_mapping";

/** Track shape: stats and standouts per bucket. */
export type Track = {
  stats: Record<string, { games?: number; releases?: number }>;
  standouts: Record<string, unknown[]>;
};

/**
 * Client-side: extract stats and standouts from API response. Handles both shapes:
 * - { timeline: { stats, standouts } }
 * - { stats, standouts }
 */
export function getTimelineStatsAndStandouts(data: unknown): {
  stats: Record<string, { games?: number; releases?: number }>;
  standouts: Record<string, unknown[]>;
} {
  const t = (data as { timeline?: unknown })?.timeline ?? data;
  const obj = t as { stats?: Record<string, { games?: number; releases?: number }>; standouts?: Record<string, unknown[]> };
  return {
    stats: obj?.stats ?? {},
    standouts: obj?.standouts ?? {},
  };
}

/**
 * Normalize timeline RPC payload. Handles:
 * - New shape: payload.timeline.tracks.origin / payload.timeline.tracks.played
 * - Old shape: payload.stats / payload.standouts directly
 */
export function normalizeTimeline(payload: unknown): { origin: Track; played?: Track } {
  const t = (payload as { timeline?: unknown })?.timeline ?? payload;
  const tracks = (t as { tracks?: { origin?: Track; played?: Track } })?.tracks;
  if (tracks?.origin) {
    return {
      origin: {
        stats: tracks.origin.stats ?? {},
        standouts: tracks.origin.standouts ?? {},
      },
      played: tracks.played
        ? { stats: tracks.played.stats ?? {}, standouts: tracks.played.standouts ?? {} }
        : undefined,
    };
  }
  const old = t as { stats?: Record<string, unknown>; standouts?: Record<string, unknown[]> };
  return {
    origin: {
      stats: (old?.stats ?? {}) as Record<string, { games?: number; releases?: number }>,
      standouts: old?.standouts ?? {},
    },
  };
}

/**
 * Normalize timeline keys (gen5a + gen5b -> gen5_1996_1999) and merge collisions.
 * Use after extracting stats/standouts from RPC payload.
 */
export function normalizeTimelineKeys(timeline: { stats?: Record<string, unknown>; standouts?: Record<string, unknown[]> }): Track {
  const statsIn = timeline?.stats ?? {};
  const standoutsIn = timeline?.standouts ?? {};

  const stats: Record<string, { games?: number; releases?: number }> = {};
  for (const [k, v] of Object.entries(statsIn)) {
    const nk = normalizeEraKeyToTimeline(k);
    const val = v as { games?: number; releases?: number };
    const prev = stats[nk];
    stats[nk] = prev
      ? { games: (prev.games ?? 0) + (val?.games ?? 0), releases: (prev.releases ?? 0) + (val?.releases ?? 0) }
      : { games: val?.games ?? 0, releases: val?.releases ?? 0 };
  }

  const standouts: Record<string, unknown[]> = {};
  for (const [k, arr] of Object.entries(standoutsIn)) {
    const nk = normalizeEraKeyToTimeline(k);
    const merged = (standouts[nk] ?? []).concat(Array.isArray(arr) ? arr : []);
    (merged as { score?: number }[]).sort((a, b) => Number((b as { score?: number })?.score ?? 0) - Number((a as { score?: number })?.score ?? 0));
    standouts[nk] = merged.slice(0, 3);
  }

  return { stats, standouts };
}
