"use client";

import { eraLabel } from "@/lib/identity/eras";

export default function EraTimeline({
  eraBuckets,
  onSelectEra,
  selectedEra,
}: {
  eraBuckets: Record<string, { games: number; releases: number }> | null | undefined;
  onSelectEra?: (era: string) => void;
  selectedEra?: string | null;
}) {
  const entries = Object.entries(eraBuckets || {}).filter(([k]) => k !== "unknown");
  if (!entries.length) return null;

  const totalGames = entries.reduce((sum, [, v]) => sum + (v?.games || 0), 0) || 1;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white">Your gamer life across eras</div>
        <div className="text-xs text-white/70">{totalGames} games</div>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-2 min-h-[44px]">
        {entries.map(([era, v]) => {
          const pct = Math.max(6, Math.round(((v.games || 0) / totalGames) * 100));
          const active = selectedEra === era;
          return (
            <button
              key={era}
              type="button"
              onClick={() => onSelectEra?.(era)}
              className={[
                "relative min-w-[120px] flex-shrink-0 rounded-xl border border-white/10 px-3 py-3 text-left",
                "bg-black/30",
                "transition active:scale-[0.99]",
                active
                  ? "border-white/25 bg-black/50"
                  : "hover:bg-black/40 hover:border-white/20 hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/30",
              ].join(" ")}
              style={{ width: `${Math.min(220, 120 + pct)}px` }}
            >
              <div className="text-xs font-medium text-white">
                {eraLabel(era)}
              </div>
              <div className="mt-1 text-lg font-semibold leading-none text-white">{v.games ?? 0}</div>
              <div className="mt-1 text-[11px] text-white/70">{v.releases ?? 0} releases</div>
            </button>
          );
        })}
      </div>

      <div className="mt-2 text-[11px] text-white/70">
        Tap an era to filter your library.
      </div>
    </div>
  );
}
