"use client";

import { GlassCard } from "@/components/ui/glass-card";
import { resolveCoverUrl } from "@/lib/images/resolveCoverUrl";
import { eraLabel, eraYears, toEraKey } from "@/lib/identity/eras";
import type { EraTimelineItem } from "@/lib/identity/types";

export type EraTimelineCardProps = {
  era: EraTimelineItem;
  onSelect: (section?: "standouts" | "played_on" | "profile") => void;
  /** When true, grey the card and disable click. */
  disabled?: boolean;
  playedOnByEra?: Record<
    string,
    {
      total_releases: number;
      handheld_share: number;
      top_device: { display_name: string; source?: "manual" | "auto" } | null;
    }
  >;
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
export function EraTimelineCard({ era, onSelect, disabled, playedOnByEra }: EraTimelineCardProps) {
  const interpretation = interpretationFromDensity(era.games, era.releases);
  const pill = disabled ? "" : rankPillLabel(era.rank);
  const displayLabel = eraLabel(era.era);
  const displayYears = eraYears(era.era) || "—";
  const hasTopSignals = era.topSignals.length > 0;
  const defaultSubtext = `${era.games} games • ${era.releases} releases`;

  const rawEraKey = (era as any).era ?? (era as any).key ?? null;
  const eraKey = rawEraKey ? toEraKey(rawEraKey) : "unknown";

  const po = (playedOnByEra as any)?.[eraKey] ?? null;

  const tip =
    po?.top_device?.display_name
      ? `Most played on: ${po.top_device.display_name}${(po as any)?.top_device?.source === "auto" ? " (Auto)" : ""}`
      : "";

  const mixBadge =
    po && (po.total_releases ?? 0) > 0
      ? (po.total_releases ?? 0) >= 3
        ? po.handheld_share >= 0.66
          ? { label: "Handheld-heavy" }
          : po.handheld_share <= 0.34
            ? { label: "Console-heavy" }
            : { label: "Mixed" }
        : { label: "Played-on" } // 👈 new
      : null;

  return (
    <GlassCard
      interactive={!disabled}
      className={[
        "p-4",
        !disabled && "cursor-pointer active:scale-[0.99]",
        disabled && "opacity-50 cursor-not-allowed",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => !disabled && onSelect(undefined)}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(undefined);
        }
      }}
    >
      {/* Header: label + years (canonical fallback) + rank pill + mix badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {displayLabel}
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-white/70">
            {displayYears}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {mixBadge ? (
            <button
              type="button"
              title={tip || mixBadge.label}
              onClick={(e) => {
                e.stopPropagation();
                onSelect("played_on");
              }}
              className="text-[11px] rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-white/70"
            >
              {mixBadge.label}
            </button>
          ) : null}
          {pill ? (
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:border-white/15 dark:bg-white/10 dark:text-white/80">
              {pill}
            </span>
          ) : null}
        </div>
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
