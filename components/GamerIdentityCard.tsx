"use client";

export type GamerIdentityCardProps = {
  primaryArchetype: {
    id: string;
    name: string;
    confidence: "core" | "strong" | "emerging";
  };
  eraAnchor: {
    id: string;
    label: string;
  };
  insightLine: string;
};

/**
 * Sacred v1 anchor. Do not overload.
 * Placement: Profile header, Home top section, Share modal.
 * Render: Archetype = largest, Era = subtitle, Insight = muted, human, no stats.
 */
export function GamerIdentityCard({
  primaryArchetype,
  eraAnchor,
  insightLine,
}: GamerIdentityCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-5 shadow-sm">
      <p className="text-xl font-bold uppercase tracking-wide text-white">
        {primaryArchetype.name}
      </p>
      <p className="mt-1 text-sm font-medium text-zinc-400">
        {eraAnchor.label}
      </p>
      <p className="mt-3 text-sm leading-relaxed text-zinc-500">
        {insightLine}
      </p>
    </div>
  );
}
