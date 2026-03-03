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
  gen2_1978_1982: "nes",
  gen3_1983_1989: "nes",
  gen4_1990_1995: "snes",
  gen5_1996_1999: "ps1",
  gen6_2000_2005: "ps2",
  gen7_2006_2012: "ps3_360",
  gen8_2013_2019: "modern",
  gen9_2020_plus: "modern",
  unknown: "modern",
  // Legacy
  gen2_1976_1984: "nes",
  gen3_1983_1992: "nes",
  gen4_1987_1996: "snes",
  gen5a_1993_1996: "ps1",
  gen5b_1996_2001: "ps1",
  gen6_1998_2005: "ps2",
  gen7_2005_2012: "ps3_360",
};

export type EraProfile = {
  owned_games?: number;
  owned_releases?: number;
  share_pct?: number; // 0..1
  top_platforms?: string[]; // optional
  most_played_on?: { name: string; source: "manual" | "auto"; also?: string[] } | null;
};

export type DrawerSection = "standouts" | "played_on" | "profile";

type EraPlayedOn = {
  total_releases: number;
  handheld_share: number;
  top_device: {
    display_name: string;
    releases?: number;
    source?: "manual" | "auto";
  } | null;
  top_devices?: { display_name: string; releases?: number; source?: "manual" | "auto" }[];
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
  /** Era-scoped stats (owned, share, platforms). Rendered above snapshot. */
  eraProfile?: EraProfile | null;
  /** Initial section to scroll to when drawer opens. */
  initialSection?: DrawerSection;
  /** Era-scoped played-on summary (devices, handheld share). */
  eraPlayedOn?: EraPlayedOn | null;
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
  eraProfile,
  initialSection,
  eraPlayedOn,
}: EraDetailDrawerProps) {
  const themeKey = eraKey ? ERA_BUCKET_TO_THEME[toEraKey(eraKey)] ?? "modern" : "modern";
  const eraTheme = ERA_THEME[themeKey] ?? ERA_THEME_DEFAULT;
  const reduce = useReducedMotion();
  const sectionVariants = reduce ? undefined : fadeUp;

  const standoutsRef = React.useRef<HTMLDivElement>(null);
  const playedOnRef = React.useRef<HTMLDivElement>(null);
  const profileRef = React.useRef<HTMLDivElement>(null);

  const sectionToShow = initialSection ?? "profile";

  React.useEffect(() => {
    if (!open) return;

    const t = window.setTimeout(() => {
      const el =
        sectionToShow === "played_on"
          ? playedOnRef.current
          : sectionToShow === "standouts"
            ? standoutsRef.current
            : profileRef.current;

      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);

    return () => window.clearTimeout(t);
  }, [open, sectionToShow]);

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
              ref={standoutsRef}
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
                <p className="text-sm text-white/50">No standouts yet</p>
              )}
            </motion.div>

            {/* 3.5. Played on in this era */}
            <motion.div
              ref={playedOnRef}
              className="pb-2"
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={2.5}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
                Played on in this era
              </h3>

              {!eraPlayedOn?.top_device ? (
                <p className="text-sm text-white/60">
                  No played-on signals yet for this era.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80">
                    Most: {eraPlayedOn.top_device.display_name}
                    {eraPlayedOn.top_device.source === "auto" ? " (Auto)" : ""}
                    {eraPlayedOn.top_device.releases != null ? ` · ${eraPlayedOn.top_device.releases}` : ""}
                  </span>

                  {eraPlayedOn.top_devices?.length ? (
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80">
                      Also:{" "}
                      {eraPlayedOn.top_devices
                        .slice(1, 3)
                        .map((d) => d.display_name)
                        .join(", ")}
                    </span>
                  ) : null}

                  {typeof eraPlayedOn.handheld_share === "number" && eraPlayedOn.total_releases >= 3 ? (
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80">
                      Handheld share: {Math.round(eraPlayedOn.handheld_share * 100)}%
                    </span>
                  ) : null}
                </div>
              )}
            </motion.div>

            {/* 4. Era-scoped archetype snapshot */}
            <motion.div
              ref={profileRef}
              className="pb-2"
              variants={sectionVariants}
              initial="hidden"
              animate="show"
              custom={3}
            >
              <h3 className="text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
                Your profile in this era
              </h3>
              {eraProfile ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {typeof eraProfile.owned_games === "number" && (
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80">
                      {eraProfile.owned_games} games
                    </span>
                  )}
                  {typeof eraProfile.owned_releases === "number" && (
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80">
                      {eraProfile.owned_releases} releases owned
                    </span>
                  )}
                  {typeof eraProfile.share_pct === "number" && (
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80">
                      {Math.round(eraProfile.share_pct * 100)}% of your library
                    </span>
                  )}
                  {eraProfile.top_platforms?.length ? (
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80">
                      Platforms: {eraProfile.top_platforms.slice(0, 2).join(", ")}
                    </span>
                  ) : null}
                  {eraProfile.most_played_on?.name ? (
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80">
                      Most played on: {eraProfile.most_played_on.name}
                      {eraProfile.most_played_on.source === "auto" ? " (Auto)" : ""}
                    </span>
                  ) : null}
                  {eraProfile.most_played_on?.also?.length ? (
                    <span className="text-xs rounded-full border border-white/10 bg-white/5 px-2 py-1 text-white/80">
                      Also: {eraProfile.most_played_on.also.join(", ")}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 flex items-start gap-2">
                {archTheme ? (
                  <span className={["shrink-0 text-white/70", eraTheme.iconColor].join(" ")} aria-hidden>
                    {/* Icon placeholder: use same era accent for consistency */}
                    <span className={["inline-block w-2 h-2 rounded-full", eraTheme.dot].join(" ")} />
                  </span>
                ) : null}
                <p className="text-sm text-white/80">
                  {archetypeSnapshot?.trim() ? archetypeSnapshot : "We're still learning your vibe in this era."}
                </p>
              </div>
            </motion.div>
          </div>
        </ArchetypeDrawerShell>
      )}
    </AnimatePresence>
  );
}
