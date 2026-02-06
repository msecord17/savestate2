"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { resolveCoverUrl } from "@/lib/images/resolveCoverUrl";
import { ERA_YEARS } from "@/lib/identity/era";
import type { EraTimelineItem } from "@/lib/identity/types";

export type EraTimelineCardProps = {
  era: EraTimelineItem;
  onSelect: () => void;
};

/** One-line interpretation from games/releases density (client-side). */
function interpretationFromDensity(games: number, releases: number): string {
  if (games === 0 && releases === 0) return "This era is part of your library.";
  const ratio = games > 0 ? releases / games : 0;
  if (releases >= 20 && ratio >= 1.5)
    return "You own a broad set of titles across platforms in this era.";
  if (games >= 15) return "This era is a cornerstone of your collection.";
  if (games >= 5) return "Your library has a solid foothold in this era.";
  return "This era is represented in your library.";
}

/** Rank pill label: "Top era" for rank 1, else "#2", "#3", … */
function rankPillLabel(rank: number): string {
  if (rank <= 0) return "";
  if (rank === 1) return "Top era";
  return `#${rank}`;
}

/**
 * Single era card for the Timeline page. Uses cover fallback: game > release > placeholder.
 * Tap opens the Era Detail Panel (drawer / bottom sheet).
 */
export function EraTimelineCard({ era, onSelect }: EraTimelineCardProps) {
  const interpretation = interpretationFromDensity(era.games, era.releases);
  const pill = rankPillLabel(era.rank);
  const displayYears = era.years?.trim() || ERA_YEARS[era.era] || "—";
  const hasTopSignals = era.topSignals.length > 0;
  const defaultSubtext = `${era.games} games • ${era.releases} releases`;

  return (
    <GlassCard
      interactive
      className="cursor-pointer p-4 active:scale-[0.99]"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Header: label + years (canonical fallback) + rank pill */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {era.label}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-white/70">
            {displayYears}
          </p>
        </div>
        {pill ? (
          <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-white/80">
            {pill}
          </span>
        ) : null}
      </div>

      {/* One-line interpretation */}
      <p className="mt-2 text-sm text-slate-700 dark:text-white/80 line-clamp-2">
        {interpretation}
      </p>

      {/* TopSignals chips or default subtext */}
      {hasTopSignals ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {era.topSignals.map((s) => (
            <span
              key={s.key}
              className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 dark:border-white/15 dark:bg-white/10 dark:text-white/70"
            >
              {s.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-600 dark:text-white/70">
          {defaultSubtext}
        </p>
      )}

      {/* Notable covers row — 3 covers, slightly overlapped */}
      <div className="relative mt-3 flex">
        {era.notable.slice(0, 3).map((n, i) => (
          <div
            key={n.release_id}
            className="h-14 w-11 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm dark:border-white/15 dark:bg-white/10"
            style={{
              marginLeft: i === 0 ? 0 : -8,
              zIndex: 3 - i,
            }}
          >
            <img
              src={resolveCoverUrl({
                game_cover_url: n.cover_url ?? undefined,
                cover_url: n.cover_url ?? undefined,
              })}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
