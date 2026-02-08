"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArchetypeDrawerShell } from "@/app/components/identity/ArchetypeDrawerShell";
import { fadeUp } from "@/src/ui/motion";
import { ERA_THEME, ERA_THEME_DEFAULT } from "@/lib/identity/strip-themes";
import { ARCHETYPE_THEME } from "@/lib/identity/strip-themes";

import { toEraKey } from "@/lib/identity/eras";

/** Map canonical era keys to ERA_THEME keys for accent color. Legacy keys normalized via toEraKey. */
const ERA_BUCKET_TO_THEME: Record<string, string> = {
  gen1_1972_1977: "atari",
  gen2_1976_1984: "nes",
  gen3_1983_1992: "nes",
  gen4_1987_1996: "snes",
  gen5a_1993_1996: "ps1",
  gen5b_1996_2001: "ps1",
  gen6_1998_2005: "ps2",
  gen7_2005_2012: "ps3_360",
  gen8_2013_2019: "modern",
  gen9_2020_plus: "modern",
  unknown: "modern",
};

export type NotableGame = {
  title: string;
  platform?: string | null;
  /** e.g. "Played on: Xbox 360" */
  played_on?: string | null;
  /** For "Signals: X/Y achievements • Zh" */
  earned?: number;
  total?: number;
  minutes_played?: number;
};

export type EraDetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Era bucket key (canonical genX or legacy; normalized for theme). */
  eraKey: string | null;
  eraLabel: string;
  eraYears: string;
  /** One sentence about this era in the user's library (no raw counts). */
  interpretation: string;
  /** Optional era-level chip labels (e.g. ["Library depth", "Era focus"]). Shown below interpretation if provided. */
  signalChips?: [string, string, string];
  /** 3–5 notable games; each can show played_on + signals chips. */
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
  const themeKey = eraKey ? ERA_BUCKET_TO_THEME[toEraKey(eraKey)] ?? "modern" : "modern";
  const eraTheme = ERA_THEME[themeKey] ?? ERA_THEME_DEFAULT;
  const reduce = useReducedMotion();
  const sectionVariants = reduce ? undefined : fadeUp;

  const title = `Origin era: ${eraLabel}`;

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

            {/* 2. Era-level signal chips (optional) */}
            {signalChips && signalChips.some(Boolean) ? (
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
            ) : null}

            {/* 3. Notable games (3–5) with played_on + signals chips */}
            <motion.div
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={2}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
                Standout titles
              </h3>
              <ul className="space-y-3">
                {notableGames.slice(0, 5).map((g, i) => {
                  const hasAchievements = g.total != null && g.total > 0;
                  const signalsLabel =
                    hasAchievements && g.earned != null
                      ? `Signals: ${g.earned}/${g.total} achievements`
                      : null;
                  const hours =
                    g.minutes_played != null && g.minutes_played > 0
                      ? `${Math.round(g.minutes_played / 60)}h`
                      : null;
                  const signalsChip =
                    signalsLabel && hours
                      ? `${signalsLabel} • ${hours}`
                      : signalsLabel ?? (hours ? `${hours} playtime` : null);
                  return (
                    <li
                      key={i}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white/90"
                    >
                      <div className="font-medium">{g.title}</div>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {g.played_on ? (
                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                              eraTheme.border,
                              eraTheme.bg,
                              "text-white/80",
                            ].join(" ")}
                          >
                            {g.played_on}
                          </span>
                        ) : null}
                        {signalsChip ? (
                          <span
                            className={[
                              "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
                              eraTheme.border,
                              eraTheme.bg,
                              "text-white/80",
                            ].join(" ")}
                          >
                            {signalsChip}
                          </span>
                        ) : null}
                        {g.platform && !g.played_on ? (
                          <span className="text-xs text-white/55">{g.platform}</span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
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
