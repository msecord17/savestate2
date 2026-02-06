"use client";

import { GlassCard } from "@/components/ui/glass-card";

type EraBucket =
  | "early_arcade_pre_crash"
  | "8bit_home"
  | "16bit"
  | "32_64bit"
  | "ps2_xbox_gc"
  | "hd_era"
  | "ps4_xbo"
  | "switch_wave"
  | "modern"
  | "unknown";

export const ERA_LABELS: Record<string, string> = {
  early_arcade_pre_crash: "Atari / Early",
  "8bit_home": "8-bit",
  "16bit": "16-bit",
  "32_64bit": "PS1/N64",
  ps2_xbox_gc: "PS2 era",
  hd_era: "HD era",
  ps4_xbo: "PS4 era",
  switch_wave: "Switch wave",
  modern: "Modern",
  unknown: "Unknown",
};

export const ERA_YEARS: Record<string, string> = {
  early_arcade_pre_crash: "≤1979",
  "8bit_home": "1980–1989",
  "16bit": "1990–1995",
  "32_64bit": "1996–2000",
  ps2_xbox_gc: "2001–2005",
  hd_era: "2006–2012",
  ps4_xbo: "2013–2016",
  switch_wave: "2017–2019",
  modern: "2020+",
  unknown: "—",
};

export function EraTimeline({
  eraBuckets,
  onSelectEra,
  selectedEra,
}: {
  eraBuckets?: Record<string, { games: number; releases: number }> | null;
  selectedEra?: string | null;
  onSelectEra?: (era: string) => void;
}) {
  const entries = Object.entries(eraBuckets || {}).filter(([k]) => k !== "unknown");
  if (!entries.length) return null;

  const totalGames = entries.reduce((sum, [, v]) => sum + (v?.games || 0), 0) || 1;
  const topEra = entries.reduce((a, b) => ((b[1]?.games ?? 0) > (a[1]?.games ?? 0) ? b : a), entries[0]);

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
        {entries.map(([era, v]) => {
          const active = selectedEra === era;
          const isTop = topEra && topEra[0] === era;
          const label = ERA_LABELS[era as EraBucket] ?? era;
          const years = ERA_YEARS[era] ?? "—";
          return (
            <GlassCard
              key={era}
              interactive
              className={[
                "min-w-[160px] flex-shrink-0 cursor-pointer p-4 active:scale-[0.99]",
                active && "border-black/20 bg-slate-50 dark:border-white/25 dark:bg-white/[0.09]",
              ]
                .filter(Boolean)
                .join(" ")}
              role="button"
              tabIndex={0}
              onClick={() => onSelectEra?.(era)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectEra?.(era);
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-white/70">{years}</div>
                </div>
                {isTop && <div className="text-xs text-slate-600 dark:text-white/70">Top era</div>}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-slate-100 p-2 dark:bg-black/20">
                  <div className="text-[11px] text-slate-600 dark:text-white/55">Games</div>
                  <div className="text-[10px] text-slate-500 dark:text-white/45">unique titles</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{v?.games ?? 0}</div>
                </div>
                <div className="rounded-lg bg-slate-100 p-2 dark:bg-black/20">
                  <div className="text-[11px] text-slate-600 dark:text-white/55">Releases</div>
                  <div className="text-[10px] text-slate-500 dark:text-white/45">platform versions</div>
                  <div className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-white">{v?.releases ?? 0}</div>
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
