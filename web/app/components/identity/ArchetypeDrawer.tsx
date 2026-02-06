"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ArchetypeDetail, IdentitySignal } from "@/lib/identity/types";
import type { Evolution } from "@/lib/identity/evolution";
import { ArchetypeDrawerShell } from "@/app/components/identity/ArchetypeDrawerShell";
import { fadeUp } from "@/src/ui/motion";
import { TrendingUp } from "lucide-react";

function strengthLabel(tier: string): string {
  const t = tier.toLowerCase();
  if (t === "core") return "Core";
  if (t === "strong") return "Strong";
  return "Emerging";
}

function confidenceLabel(c: number): "Low" | "Med" | "High" {
  if (c >= 0.7) return "High";
  if (c >= 0.5) return "Med";
  return "Low";
}

function proofLine(signals: IdentitySignal[]): string {
  const parts: string[] = [];
  const hasPlay = signals.some((s) => s.source === "play" || s.key === "completion" || s.key === "depth");
  const hasTime = signals.some((s) => s.source === "time" || s.key === "platforms");
  if (hasPlay) parts.push("trophies, playtime");
  if (hasTime) parts.push("era spread");
  if (parts.length === 0) return "Based on your connected platforms and activity.";
  return `Based on ${parts.join(", ")}.`;
}

function hasCollectorSignals(signals: IdentitySignal[]): boolean {
  return signals.some((s) => s.source === "ownership" || s.key === "ownership");
}

export function ArchetypeDrawer({
  open,
  onClose,
  onOpenChange,
  detail,
  evolution: evo,
  primaryEra,
}: {
  open: boolean;
  onClose?: () => void;
  /** Optional: pass setDrawerOpen so drawer calls setDrawerOpen(false) when closing */
  onOpenChange?: (open: boolean) => void;
  detail: ArchetypeDetail | null;
  /** Optional: computed evolution (note + confidence) for cohesive narrative */
  evolution?: Evolution | null;
  /** Optional: era key for drawer header accent bar (era-coded color) */
  primaryEra?: string | null;
}) {
  const handleOpenChange = React.useCallback(
    (v: boolean) => {
      onOpenChange?.(v);
      if (!v) onClose?.();
    },
    [onOpenChange, onClose]
  );

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") handleOpenChange(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleOpenChange]);

  const reduce = useReducedMotion();
  const sectionVariants = reduce ? undefined : fadeUp;

  return (
    <AnimatePresence>
      {open && (
        <ArchetypeDrawerShell
          key="archetype-drawer"
          open={open}
          onOpenChange={handleOpenChange}
          title={detail?.name ?? "Archetype"}
          eraKey={primaryEra}
        >
          <div className="space-y-4">
            {/* 1. Archetype header: strength pill + one-liner (name is in shell title) */}
            <motion.div
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={0}
            >
          <div className="flex flex-wrap items-center gap-2">
            {detail?.tier ? (
              <span className="text-xs font-medium rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-white/80">
                {strengthLabel(detail.tier)}
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-white/70">
            {detail?.oneLiner ?? "No archetype data yet."}
          </p>
            </motion.div>

            {/* 2. Top Signals — 3–5 pills with score (High/Med/Low or %) */}
            <motion.div
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={1}
            >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
            Top Signals
          </h3>
          <div className="flex flex-wrap gap-2">
            {(detail?.signals ?? [])
              .filter((s) => typeof s.value === "number")
              .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
              .slice(0, 5)
              .map((s) => {
                const v = s.value ?? 0;
                const score = Math.round(v * 100);
                return (
                  <span
                    key={s.key}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/80"
                  >
                    <TrendingUp className="h-3.5 w-3.5 text-white/50 shrink-0" />
                    <span className="truncate max-w-[100px]">{s.label}</span>
                    <span className="tabular-nums text-white/60">{score}%</span>
                  </span>
                );
              })}
          </div>
          {(!detail?.signals?.length || detail.signals.every((s) => s.value == null)) && (
            <p className="text-xs text-white/50 mt-1">Connect a platform or sync progress to see signals.</p>
          )}
            </motion.div>

            {/* 3. Evolution — micro-line + 1 sentence */}
            <motion.div
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={2}
            >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
            Evolution
          </h3>
          {evo ? (
            <>
              <p className="text-sm text-white/80">{evo.note ?? "We're still building enough signal."}</p>
              <p className="text-xs text-white/50 mt-1">Confidence: {confidenceLabel(evo.confidence)}</p>
            </>
          ) : detail?.evolution ? (
            <p className="text-sm text-white/70">
              {detail.evolution.from} → {detail.evolution.to}. {detail.evolution.tag}
            </p>
          ) : (
            <p className="text-sm text-white/50">No evolution story yet — need more time-series signal.</p>
          )}
            </motion.div>

            {/* 4. Proof / Evidence */}
            <motion.div
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={3}
            >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
            Proof / Evidence
          </h3>
          <p className="text-sm text-white/70">
            {detail?.signals?.length ? proofLine(detail.signals) : "Based on your connected platforms and activity."}
          </p>
          {detail?.signals && hasCollectorSignals(detail.signals) && (
            <p className="text-xs text-white/50 mt-2">
              Collector signals are present; we weight them separately.
            </p>
          )}
            </motion.div>

            {/* 5. What to do next — 2 tiny actions */}
            <motion.div
              className="pb-2"
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={4}
            >
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
            What to do next
          </h3>
          {(detail?.nextSteps ?? []).length > 0 ? (
            <div className="space-y-1.5">
              {detail!.nextSteps.slice(0, 2).map((n, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <p className="text-sm text-white">{n.label}</p>
                  <p className="text-xs text-white/50 mt-0.5">{n.hint}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/50">You're good — nothing urgent right now.</p>
          )}
            </motion.div>
          </div>
        </ArchetypeDrawerShell>
      )}
    </AnimatePresence>
  );
}
