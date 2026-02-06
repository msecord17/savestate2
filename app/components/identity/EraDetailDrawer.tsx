"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArchetypeDrawerShell } from "@/app/components/identity/ArchetypeDrawerShell";
import { fadeUp } from "@/src/ui/motion";
import { ERA_THEME, ERA_THEME_DEFAULT } from "@/lib/identity/strip-themes";
import { ARCHETYPE_THEME } from "@/lib/identity/strip-themes";

/** Map era bucket keys (EraTimeline) to ERA_THEME keys for accent color. */
const ERA_BUCKET_TO_THEME: Record<string, string> = {
  early_arcade_pre_crash: "atari",
  "8bit_home": "nes",
  "16bit": "snes",
  "32_64bit": "ps1",
  ps2_xbox_gc: "ps2",
  hd_era: "ps3_360",
  ps4_xbo: "modern",
  switch_wave: "wii",
  modern: "modern",
  unknown: "modern",
};

export type NotableGame = { title: string; platform?: string | null };

export type EraDetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Era bucket key (e.g. ps2_xbox_gc). */
  eraKey: string | null;
  eraLabel: string;
  eraYears: string;
  /** One sentence about this era in the user's library (no raw counts). */
  interpretation: string;
  /** Exactly 3 short chip labels (no numbers). */
  signalChips: [string, string, string];
  /** 3–5 notable games from this era. */
  notableGames: NotableGame[];
  /** Era-scoped archetype line, e.g. "Your collection in this era leans Explorer." */
  archetypeSnapshot: string;
  /** Primary archetype key for icon (e.g. explorer). */
  primaryArchetypeKey?: string | null;
  /** When achievements chip is from < 3 titles, e.g. "Based on 2 titles with achievements." */
  achievementsClarification?: string | null;
};

export function EraDetailDrawer({
  open,
  onOpenChange,
  eraKey,
  eraLabel,
  eraYears,
  interpretation,
  signalChips,
  notableGames,
  archetypeSnapshot,
  primaryArchetypeKey,
  achievementsClarification,
}: EraDetailDrawerProps) {
  const themeKey = eraKey ? ERA_BUCKET_TO_THEME[eraKey] ?? "modern" : "modern";
  const eraTheme = ERA_THEME[themeKey] ?? ERA_THEME_DEFAULT;
  const reduce = useReducedMotion();
  const sectionVariants = reduce ? undefined : fadeUp;

  const title = `${eraLabel} · ${eraYears}`;

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const archTheme = primaryArchetypeKey ? ARCHETYPE_THEME[primaryArchetypeKey] : null;

  return (
    <AnimatePresence>
      {open && (
        <ArchetypeDrawerShell
          key="era-detail-drawer"
          open={open}
          onOpenChange={onOpenChange}
          title={title}
          eraKey={themeKey}
        >
          <div className="space-y-5">
            {/* 1. Interpretation sentence */}
            <motion.p
              className="text-sm text-white/80"
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={0}
            >
              {interpretation}
            </motion.p>

            {/* 2. Three signal chips */}
            <motion.div
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={1}
            >
              <div className="flex flex-wrap gap-2">
                {signalChips.map((label, i) => (
                  <span
                    key={i}
                    className={[
                      "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                      eraTheme.border,
                      eraTheme.bg,
                      "text-white/90",
                    ].join(" ")}
                  >
                    {label}
                  </span>
                ))}
              </div>
              {achievementsClarification ? (
                <p className="mt-2 text-xs text-white/60">{achievementsClarification}</p>
              ) : null}
            </motion.div>

            {/* 3. Notable games (3–5) */}
            <motion.div
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={2}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
                Standout titles
              </h3>
              <ul className="space-y-2">
                {notableGames.slice(0, 5).map((g, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90"
                  >
                    <span className="font-medium">{g.title}</span>
                    {g.platform ? (
                      <span className="ml-2 text-xs text-white/55">{g.platform}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {notableGames.length === 0 && (
                <p className="text-sm text-white/50">No games in this era in your library yet.</p>
              )}
            </motion.div>

            {/* 4. Era-scoped archetype snapshot */}
            <motion.div
              className="pb-2"
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={3}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
                Your profile in this era
              </h3>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 flex items-start gap-2">
                {archTheme ? (
                  <span className={["shrink-0 text-white/70", eraTheme.iconColor].join(" ")} aria-hidden>
                    {/* Icon placeholder: use same era accent for consistency */}
                    <span className={["inline-block w-2 h-2 rounded-full", eraTheme.dot].join(" ")} />
                  </span>
                ) : null}
                <p className="text-sm text-white/80">{archetypeSnapshot}</p>
              </div>
            </motion.div>
          </div>
        </ArchetypeDrawerShell>
      )}
    </AnimatePresence>
  );
}
