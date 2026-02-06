"use client";

import { EraTimelineCard } from "@/components/identity/EraTimelineCard";
import type { EraTimelineItem, TimelineResponse } from "@/lib/identity/types";
import { ArrowDownUp, Calendar, Gamepad2 } from "lucide-react";

export type TimelineViewProps = {
  data: TimelineResponse | null;
  loading: boolean;
  mode: "release_year" | "played_on_gen";
  onModeChange: (mode: "release_year" | "played_on_gen") => void;
  sort: "dominance" | "chronological";
  onSortChange: (sort: "dominance" | "chronological") => void;
  onSelectEra: (era: EraTimelineItem) => void;
};

/**
 * Timeline page content (mobile-first): lens toggle (Release Eras | Played-On Generations),
 * sort toggle (Dominance | Chronological), vertical list of EraTimelineCard. Tap card → Era Detail Panel.
 */
export function TimelineView({
  data,
  loading,
  mode,
  onModeChange,
  sort,
  onSortChange,
  onSelectEra,
}: TimelineViewProps) {
  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">
        Your timeline
      </h1>
      <p className="mt-1 text-sm text-slate-600 dark:text-white/70">
        {mode === "release_year"
          ? "Your library by release era. Tap an era for details."
          : "Hardware generations you played on. Tap for details."}
      </p>

      <div className="mt-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-white/55">
            View
          </span>
          <div className="flex rounded-lg border border-slate-200 bg-white dark:border-white/15 dark:bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => onModeChange("release_year")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                mode === "release_year"
                  ? "bg-slate-200 text-slate-900 dark:bg-white/15 dark:text-white"
                  : "text-slate-600 dark:text-white/60"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Release Eras
            </button>
            <button
              type="button"
              onClick={() => onModeChange("played_on_gen")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                mode === "played_on_gen"
                  ? "bg-slate-200 text-slate-900 dark:bg-white/15 dark:text-white"
                  : "text-slate-600 dark:text-white/60"
              }`}
            >
              <Gamepad2 className="h-3.5 w-3.5" />
              Played-On Gen
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-white/55">
            Sort
          </span>
          <div className="flex rounded-lg border border-slate-200 bg-white dark:border-white/15 dark:bg-white/5 p-0.5">
            <button
              type="button"
              onClick={() => onSortChange("dominance")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                sort === "dominance"
                  ? "bg-slate-200 text-slate-900 dark:bg-white/15 dark:text-white"
                  : "text-slate-600 dark:text-white/60"
              }`}
            >
              <ArrowDownUp className="h-3.5 w-3.5" />
              Dominance
            </button>
            <button
              type="button"
              onClick={() => onSortChange("chronological")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                sort === "chronological"
                  ? "bg-slate-200 text-slate-900 dark:bg-white/15 dark:text-white"
                  : "text-slate-600 dark:text-white/60"
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Chronological
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-6 py-8 text-center text-sm text-slate-500 dark:text-white/50">
          Loading…
        </div>
      ) : !data?.eras?.length ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5 text-center text-sm text-slate-500 dark:text-white/50">
          No era data yet. Add games to your library to see your timeline.
        </div>
      ) : (
        <ul className="mt-6 space-y-4 pb-8">
          {data.eras.map((item) => (
            <li key={item.era}>
              <EraTimelineCard
                era={item}
                onSelect={() => onSelectEra(item)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
