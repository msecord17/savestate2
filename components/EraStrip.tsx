"use client";

import { useState } from "react";

export type EraStripEra = {
  id: string;
  label: string;
  culturalLine: string;
  personalLine: string;
};

export type EraStripProps = {
  eras: EraStripEra[];
};

/**
 * Contextual era strip. Collapsed by default.
 * Expanded: mini-timeline of eras with cultural + personal insight per era.
 */
export function EraStrip({ eras }: EraStripProps) {
  const [expanded, setExpanded] = useState(false);

  if (!eras.length) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white/20"
        aria-expanded={expanded}
      >
        <span className="text-sm font-medium text-zinc-300">
          Your eras
        </span>
        <span className="text-zinc-500" aria-hidden>
          {expanded ? "−" : "+"}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-white/10 px-4 py-3 space-y-4">
          {eras.map((era) => (
            <div key={era.id} className="space-y-1">
              <p className="text-sm font-semibold text-white">
                {era.label}
              </p>
              <p className="text-xs leading-relaxed text-zinc-500">
                {era.culturalLine}
              </p>
              <p className="text-sm leading-relaxed text-zinc-400">
                {era.personalLine}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
