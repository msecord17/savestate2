import type { IdentitySummaryApiResponse } from "@/lib/identity/types";

const STRENGTH_LABELS: Record<string, string> = {
  emerging: "Emerging",
  strong: "Strong",
  core: "Core",
};

/** Minimal share card for public /share/[shareId] — archetype, era, top signal. */
export default function IdentityShareCard({
  data,
}: {
  data: IdentitySummaryApiResponse;
}) {
  const prim = data.primary_archetype;
  const era = data.era_affinity;
  const topSignal = data.top_signals?.[0];

  return (
    <article
      className="max-w-md mx-auto rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden"
      aria-label="Identity share card"
    >
      <div className="p-6 space-y-4">
        <h1 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Gamer Identity
        </h1>

        {/* Primary archetype */}
        <div>
          <p className="text-lg font-semibold text-neutral-900 dark:text-white">
            {prim?.name ?? "Explorer"}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-0.5">
            {prim?.one_liner}
          </p>
          {prim?.strength && (
            <span className="inline-block mt-2 rounded-full px-2.5 py-0.5 text-xs font-medium bg-neutral-200 dark:bg-white/10 text-neutral-700 dark:text-neutral-300">
              {STRENGTH_LABELS[prim.strength] ?? prim.strength}
            </span>
          )}
        </div>

        {/* Era */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Primary era
          </p>
          <p className="text-base font-medium text-neutral-900 dark:text-white">
            {era?.name ?? "Modern"}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            {era?.one_liner}
          </p>
        </div>

        {/* Top signal */}
        {topSignal && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
              Top signal
            </p>
            <p className="text-sm text-neutral-900 dark:text-white">
              {topSignal.label}
              {topSignal.value != null && (
                <span className="text-neutral-500 dark:text-neutral-400 ml-1">
                  {Math.round(topSignal.value * 100)}%
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      <footer className="px-6 py-3 border-t border-neutral-100 dark:border-white/5 text-xs text-neutral-400 dark:text-neutral-500">
        Shared via SaveState
      </footer>
    </article>
  );
}
