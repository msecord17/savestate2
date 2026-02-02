"use client";

export type CollectorBadgeArchetype = "Archivist" | "Era Keeper" | "Variant Hunter";

export type CollectorBadgeProps = {
  archetype: CollectorBadgeArchetype;
  descriptor: string;
};

/**
 * Collector identity badge. Small but proud.
 * Only render when collector signals pass gate (parent decides).
 * Paired with ownership verbs — never "You played…"
 */
export function CollectorBadge({ archetype, descriptor }: CollectorBadgeProps) {
  return (
    <div className="inline-flex flex-col gap-0.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
      <span className="text-xs font-semibold uppercase tracking-wider text-amber-400/90">
        {archetype}
      </span>
      <span className="text-xs text-zinc-400">
        {descriptor}
      </span>
    </div>
  );
}
