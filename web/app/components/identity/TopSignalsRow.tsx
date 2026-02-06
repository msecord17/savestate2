"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { pressable } from "@/src/ui/motion";
import { useReducedMotion } from "framer-motion";

/** Minimal shape: TopSignalsRow only reads detail.signals (key, label, value, note). */
type SignalLike = { key: string; label: string; value: number; note?: string };
type DetailLike = { signals: SignalLike[] } | null;

function tierWord(v: number) {
  if (v >= 0.75) return "Core";
  if (v >= 0.45) return "Strong";
  return "Emerging";
}

function useMaxSignals(): number {
  const [max, setMax] = React.useState(3);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setMax(mq.matches ? 5 : 3);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return max;
}

export function TopSignalsRow({
  detail,
  className,
  onOpenDrawer,
}: {
  detail: DetailLike;
  className?: string;
  /** Optional: tap any signal card to open the archetype drawer */
  onOpenDrawer?: () => void;
}) {
  const maxSignals = useMaxSignals();
  const reducedMotion = useReducedMotion();
  const allSignals = (detail?.signals ?? [])
    .filter((s) => typeof s.value === "number")
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const signals = allSignals.slice(0, maxSignals);

  if (!signals.length) return null;

  const baseCardClass =
    "rounded-2xl border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/5 p-3 text-left shrink-0 min-h-[44px] min-w-[100px] max-w-[160px]";
  const interactiveClass =
    "active:scale-[0.98] transition cursor-pointer hover:bg-neutral-200 dark:hover:bg-white/8";

  return (
    <section className={cn("px-4 pb-2", className)}>
      {/* Single row, no wrap; horizontal scroll on small (3 visible), 5 on tablet/desktop. */}
      <div
        className={cn(
          "flex gap-2 overflow-x-auto scrollbar-none",
          "[-webkit-overflow-scrolling:touch]"
        )}
      >
        {signals.map((s) => {
          const pct = Math.max(0, Math.min(100, Math.round((s.value ?? 0) * 100)));
          const content = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-neutral-700 dark:text-white/70 truncate min-w-0">
                  {s.label}
                </span>
                <span className="text-[10px] rounded-full border border-neutral-300 dark:border-white/10 bg-neutral-200/80 dark:bg-black/20 px-2 py-1 text-neutral-600 dark:text-white/60 shrink-0">
                  {tierWord(s.value ?? 0)}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-neutral-200 dark:bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-neutral-500 dark:bg-white/40"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[10px] text-neutral-500 dark:text-white/45 line-clamp-1 min-w-0">
                  {s.note ?? ""}
                </span>
                <span className="text-[10px] text-neutral-600 dark:text-white/55 tabular-nums shrink-0">
                  {pct}%
                </span>
              </div>
            </>
          );
          return onOpenDrawer ? (
            <motion.button
              key={s.key}
              type="button"
              {...(reducedMotion ? {} : pressable)}
              onClick={onOpenDrawer}
              className={cn(baseCardClass, interactiveClass, "touch-manipulation")}
              aria-label={`${s.label}, ${pct}% — open archetype details`}
            >
              {content}
            </motion.button>
          ) : (
            <div key={s.key} className={baseCardClass}>
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
