"use client";

export type InsightCard = {
  id: string;
  type: "era" | "archetype" | "blend" | "transition" | "collector";
  copy: string;
  confidence: "high" | "medium";
};

export type InsightRailProps = {
  insights: InsightCard[];
};

const MAX_CARDS = 5;

/**
 * Scrollable rail of insight cards. Calm, readable. No charts, no numbers.
 * Tap opens "Why we think this" (hook for later).
 */
export function InsightRail({ insights }: InsightRailProps) {
  const cards = insights.slice(0, MAX_CARDS);

  return (
    <div className="w-full overflow-x-auto overflow-y-hidden pb-2">
      <div className="flex gap-3">
        {cards.map((insight) => (
          <InsightCard key={insight.id} insight={insight} />
        ))}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: InsightCard }) {
  const handleTap = () => {
    // "Why we think this" — hook for later
  };

  return (
    <button
      type="button"
      onClick={handleTap}
      className="min-w-[280px] max-w-[320px] flex-shrink-0 rounded-xl border border-white/10 bg-zinc-900/50 p-4 text-left transition-colors hover:border-white/15 hover:bg-zinc-900/70 focus:outline-none focus:ring-2 focus:ring-white/20"
      aria-label={insight.copy}
    >
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        {insight.type}
      </span>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">
        {insight.copy}
      </p>
    </button>
  );
}
