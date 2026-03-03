"use client";

import { GlassCard } from "@/components/ui/glass-card";
import type { TimelineStandout } from "@/lib/identity/timeline-view";
import { toEraKey } from "@/lib/identity/eras";

function eraMixBadge(s?: { total_releases: number; handheld_share: number } | null) {
  if (!s || (s.total_releases ?? 0) < 3) return null; // avoid noisy badges
  const h = s.handheld_share ?? 0;

  if (h >= 0.66) return { label: "Handheld-heavy" };
  if (h <= 0.34) return { label: "Console-heavy" };
  return { label: "Mixed" };
}

export type EraTimelineEra = {
  key: string;
  meta: { title: string; sub: string; order: number };
  stats: { games: number; releases: number } | null;
  standouts: TimelineStandout[];
};

export function EraTimeline({
  eras,
  onSelectEra,
  selectedEra,
  playedOnByEra,
}: {
  eras: EraTimelineEra[];
  selectedEra?: string | null;
  onSelectEra?: (era: string) => void;
  playedOnByEra?: Record<
    string,
    {
      total_releases: number;
      handheld_share: number;
      top_device: { display_name: string } | null;
    }
  >;
}) {
  const totalGames = eras.reduce(
    (sum, e) => sum + (e.stats?.games ?? 0),
    0
  );
  const topEra = eras.length > 0
    ? eras.reduce(
        (a, b) =>
          (b.stats?.games ?? 0) > (a.stats?.games ?? 0) ? b : a,
        eras[0]
      )
    : null;

  return (
    <div className="rounded-2xl border border-black/10 border-white/10 bg-white dark:bg-white/[0.06] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900 dark:text-white">Your gamer life across eras</div>
        <div className="text-xs text-slate-600 dark:text-white/70">{totalGames} games</div>
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-white/70">
        Games = unique titles • Releases = platform versions
      </p>

      <div className="mt-3 flex gap-3 overflow-x-auto pb-2 min-h-[44px]">
        {eras.map((era) => {
          const games = era.stats?.games ?? 0;
          const releases = era.stats?.releases ?? 0;
          const disabled = games === 0;
          const active = selectedEra === era.key;
          const isTop = topEra && topEra.key === era.key && games > 0;
          const label = era.meta.title;
          const years = era.meta.sub || "—";

          const eraKey = toEraKey(era.key);
          const s = playedOnByEra?.[eraKey] ?? null;
          const badge = eraMixBadge(s);
          const tip = s?.top_device?.display_name
            ? `Most played on: ${s.top_device.display_name}`
            : badge?.label ?? "";

          return (
            <GlassCard
              key={era.key}
              interactive={!disabled}
              className={[
                "min-w-[160px] flex-shrink-0 p-4",
                !disabled && "cursor-pointer active:scale-[0.99]",
                disabled && "opacity-50 cursor-not-allowed",
                active && !disabled && "border-black/20 bg-slate-50 dark:border-white/25 dark:bg-white/[0.09]",
              ]
                .filter(Boolean)
                .join(" ")}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-disabled={disabled}
              onClick={() => !disabled && onSelectEra?.(era.key)}
              onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectEra?.(era.key);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-white/70">{years}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {badge ? (
                    <span
                      title={tip}
                      className="ml-auto text-[11px] rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/70"
                    >
                      {badge.label}
                    </span>
                  ) : null}
                  {isTop && <div className="text-xs text-slate-600 dark:text-white/70">Top era</div>}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-100 p-2 dark:bg-black/20">
                  <div className="text-[11px] text-slate-600 dark:text-white/55">Games</div>
                  <div className="text-[10px] text-slate-500 dark:text-white/45">unique titles</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{games}</div>
                </div>
                <div className="rounded-lg bg-slate-100 p-2 dark:bg-black/20">
                  <div className="text-[11px] text-slate-600 dark:text-white/55">Releases</div>
                  <div className="text-[10px] text-slate-500 dark:text-white/45">platform versions</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{releases}</div>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      <div className="mt-2 text-[11px] text-slate-600 dark:text-white/70">
        Tap an era to filter your library.
      </div>
    </div>
  );
}
