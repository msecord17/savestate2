import {
  normalizeEraKeyToTimeline,
  type TimelineEraKey,
} from "@/lib/identity/era-mapping";

type EraStats = Record<string, { games: number; releases: number }>;

type Standout = {
  release_id: string;
  title: string;
  cover_url?: string | null;
  played_on?: string | null;
  earned?: number | null;
  total?: number | null;
  minutes_played?: number | null;
  score?: number | null;
};

export type OriginTimeline = {
  stats?: EraStats;
  standouts?: Record<string, Standout[]>;
};

/** Input shape: accepts Track (games/releases optional) from normalizeTimeline. */
type OriginTimelineInput = {
  stats?: Record<string, { games?: number; releases?: number }>;
  standouts?: Record<string, unknown[]>;
};

export function normalizeOriginTimeline(raw: OriginTimelineInput | null | undefined): OriginTimeline {
  const statsIn = raw?.stats ?? {};
  const standoutsIn = raw?.standouts ?? {};

  const statsOut: Record<string, { games: number; releases: number }> = {};
  const standoutsOut: Record<string, Standout[]> = {};

  // stats: sum into canonical keys
  for (const [k, v] of Object.entries(statsIn)) {
    const nk: TimelineEraKey = normalizeEraKeyToTimeline(k);
    if (!nk || nk === "unknown") continue;

    const prev = statsOut[nk] ?? { games: 0, releases: 0 };
    statsOut[nk] = {
      games: prev.games + (v?.games ?? 0),
      releases: prev.releases + (v?.releases ?? 0),
    };
  }

  // standouts: merge + dedupe + keep top 3 by score
  for (const [k, arr] of Object.entries(standoutsIn)) {
    const nk: TimelineEraKey = normalizeEraKeyToTimeline(k);
    if (!nk || nk === "unknown") continue;

    const merged = (standoutsOut[nk] ?? []).concat(
      Array.isArray(arr) ? (arr as Standout[]) : []
    );
    const byId = new Map<string, Standout>();

    for (const s of merged) {
      if (!s?.release_id) continue;
      const existing = byId.get(s.release_id);
      if (!existing) {
        byId.set(s.release_id, s);
      } else {
        const a = existing.score ?? -Infinity;
        const b = s.score ?? -Infinity;
        if (b > a) byId.set(s.release_id, s);
      }
    }

    const sorted = Array.from(byId.values()).sort(
      (a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity)
    );

    standoutsOut[nk] = sorted.slice(0, 3);
  }

  return { ...(raw ?? {}), stats: statsOut, standouts: standoutsOut };
}
