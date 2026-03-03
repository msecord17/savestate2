// lib/identity/timeline-view.ts
import { ORIGIN_BUCKET_META } from "@/lib/identity/era";

export type TimelineStandout = {
  release_id: string;
  title: string;
  cover_url: string | null;
  played_on: string | null;
  earned: number | null;
  total: number | null;
  minutes_played: number | null;
  score: number | null;
};

export type TimelineStats = { games: number; releases: number };

export type TimelineShape = {
  stats?: Record<string, TimelineStats>;
  standouts?: Record<string, TimelineStandout[]>;
};

// Canonical render order (your "truth")
export const TIMELINE_ORDER = Object.keys(
  ORIGIN_BUCKET_META
) as (keyof typeof ORIGIN_BUCKET_META)[];

export function unwrapTimeline(input: any): TimelineShape {
  // Handles: payload.timeline OR payload.timeline.timeline OR raw timeline
  const t = input?.timeline?.stats ? input.timeline : input;
  const tt = t?.timeline?.stats ? t.timeline : t;
  return (tt ?? {}) as TimelineShape;
}

export function buildTimelineEras(input: any) {
  const t = unwrapTimeline(input);
  const stats = t.stats ?? {};
  const standouts = t.standouts ?? {};

  return TIMELINE_ORDER
    .filter((k) => k !== "unknown")
    .map((key) => {
      const meta = ORIGIN_BUCKET_META[key] ?? ORIGIN_BUCKET_META.unknown;
      const s = stats[String(key)] ?? null;
      const items = standouts[String(key)] ?? [];
      return {
        key: String(key),
        meta,
        stats: s, // null means "no data for this era"
        standouts: items,
      };
    })
    .filter((e) => e.stats && (e.stats.games > 0 || e.stats.releases > 0));
}
