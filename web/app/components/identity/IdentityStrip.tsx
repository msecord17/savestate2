"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import {
  ERA_THEME,
  ERA_THEME_DEFAULT,
  STRENGTH_PILL_STYLES,
  type StrengthTier,
} from "@/lib/identity/strip-themes";
import { motion, useReducedMotion } from "framer-motion";
import { pressable, hoverLift } from "@/src/ui/motion";

/** Core strength dot: subtle pulse only when NOT reduced motion. */
function CoreDot({ enabled, className }: { enabled: boolean; className?: string }) {
  const reduce = useReducedMotion();
  if (!enabled) return null;
  return (
    <motion.span
      className={cn("inline-block h-2 w-2 rounded-full shrink-0", className)}
      aria-hidden
      animate={reduce ? undefined : { opacity: [0.7, 1, 0.7] }}
      transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export type IdentityChip = {
  key: string;
  label: string;
  sub?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Theme: era = tint bg + border + dot; archetype = icon + neutral + strength pill; evolution = neutral */
  kind?: "archetype" | "era" | "evolution";
  /** For kind="era": lookup in ERA_THEME */
  eraKey?: string;
  /** For kind="archetype": strength pill style (Emerging / Strong / Core) */
  tier?: StrengthTier;
};

const NEUTRAL_CHIP =
  "rounded-full border border-neutral-200 bg-neutral-100 dark:border-white/10 dark:bg-white/5 text-neutral-900 dark:text-white";

function ChipContent({ c }: { c: IdentityChip }) {
  const reducedMotion = useReducedMotion();
  const eraKey = c.kind === "era" ? c.eraKey : undefined;
  const isEra = Boolean(eraKey);
  const theme = eraKey ? ERA_THEME[eraKey] ?? ERA_THEME_DEFAULT : null;

  const chipClass = cn(
    "flex items-center gap-2 flex-nowrap",
    "rounded-full border px-3 py-2 min-h-[44px] shrink-0",
    c.disabled ? "opacity-50" : "",
    isEra && theme
      ? `${theme.bg} ${theme.border}`
      : NEUTRAL_CHIP
  );

  const strengthTier = c.kind === "archetype" && c.tier ? c.tier : null;
  const strengthStyle = strengthTier ? STRENGTH_PILL_STYLES[strengthTier] : null;
  const isCore = strengthTier === "core";

  return (
    <span className={chipClass}>
      {c.icon ? (
        <span
          className={cn(
            "grid place-items-center w-5 h-5 shrink-0",
            isEra && theme ? theme.iconColor : "text-neutral-700 dark:text-white/80"
          )}
        >
          {c.icon}
        </span>
      ) : isEra && theme ? (
        <span className={cn("w-2 h-2 rounded-full shrink-0", theme.dot)} aria-hidden />
      ) : null}
      <span className="flex flex-col items-start leading-tight min-w-0">
        <span
          className={cn(
            "text-sm font-medium truncate text-inherit",
            c.kind === "archetype" && "max-w-[12ch] md:max-w-none"
          )}
        >
          {c.label}
        </span>
        {c.sub ? (
          strengthStyle ? (
            <span className="inline-flex items-center gap-1.5 mt-0.5">
              <CoreDot
                enabled={isCore}
                className="bg-neutral-500 dark:bg-white/50"
              />
              <span
                className={cn(
                  "text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 inline-block",
                  strengthStyle.container
                )}
              >
                {c.sub}
              </span>
            </span>
          ) : (
            <span className="text-xs text-neutral-600 dark:text-white/60 truncate">
              {c.sub}
            </span>
          )
        ) : null}
      </span>
    </span>
  );
}

export function IdentityStrip({
  chips,
  onOpenDrawer,
  className,
}: {
  chips: IdentityChip[];
  onOpenDrawer?: () => void;
  className?: string;
}) {
  const rowContent = (
    <div
      className={cn(
        "flex flex-nowrap gap-2 min-h-[44px]",
        "overflow-x-auto scrollbar-none",
        "pb-2",
        "[-webkit-overflow-scrolling:touch]"
      )}
    >
      {chips.map((c) => (
        <ChipContent key={c.key} c={c} />
      ))}
    </div>
  );

  const reduce = useReducedMotion();

  const stripEnter = reduce
    ? undefined
    : { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.18 } };

  return (
    <motion.section
      className={cn("w-full", "px-4 pt-3", className)}
      {...(stripEnter ?? {})}
    >
      {onOpenDrawer && !chips.some((c) => c.disabled) ? (
        <motion.button
          type="button"
          {...(reduce ? {} : pressable)}
          {...(reduce ? {} : hoverLift)}
          onClick={onOpenDrawer}
          className={cn(
            "w-full text-left",
            "min-h-[44px] min-w-[44px]",
            "rounded-xl border border-transparent",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-neutral-400 dark:focus-visible:ring-neutral-500",
            "hover:border-neutral-300/80 dark:hover:border-white/20",
            "touch-manipulation"
          )}
        >
          {rowContent}
        </motion.button>
      ) : (
        <div className="min-h-[44px]">{rowContent}</div>
      )}
    </motion.section>
  );
}
