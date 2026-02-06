/**
 * Identity Strip visual language: ERA_THEME (color, label, icon) + ARCHETYPE_THEME (icon, short label).
 * Era owns color: chip tint (10–16% opacity), border (25–35%), dot/icon full. "Glow in the dark plastic" — muted, not neon.
 * Archetype: icon + neutral chip; color stays era-owned.
 */

export type EraKey =
  | "atari"
  | "nes"
  | "snes"
  | "ps1"
  | "ps2"
  | "ps3_360"
  | "wii"
  | "modern";

export type EraThemeEntry = {
  /** Short label for strip chip (e.g. "NES", "Modern") */
  label: string;
  /** Lucide icon name for era chip */
  icon: string;
  /** Tailwind: tint background ~10–16% opacity */
  bg: string;
  /** Tailwind: border same color ~25–35% opacity */
  border: string;
  /** Tailwind: dot full color (bg) */
  dot: string;
  /** Tailwind: icon full color (text) for era chip */
  iconColor: string;
  /** Tailwind: accent bar (e.g. drawer header left bar) */
  accent: string;
};

/** Era palette per spec: one color per era, consistent across chip, accent bar, dot. */
export const ERA_THEME: Record<string, EraThemeEntry> = {
  atari: {
    label: "Atari",
    icon: "Joystick",
    bg: "bg-amber-500/10 dark:bg-amber-400/10",
    border: "border-amber-500/30 dark:border-amber-400/25",
    dot: "bg-amber-500 dark:bg-amber-400",
    iconColor: "text-amber-600 dark:text-amber-400",
    accent: "bg-amber-500 dark:bg-amber-400",
  },
  nes: {
    label: "NES",
    icon: "Gamepad",
    bg: "bg-red-500/10 dark:bg-red-400/10",
    border: "border-red-500/30 dark:border-red-400/25",
    dot: "bg-red-500 dark:bg-red-400",
    iconColor: "text-red-600 dark:text-red-400",
    accent: "bg-red-500 dark:bg-red-400",
  },
  snes: {
    label: "SNES",
    icon: "Gamepad",
    bg: "bg-purple-500/10 dark:bg-purple-400/10",
    border: "border-purple-500/30 dark:border-purple-400/25",
    dot: "bg-purple-500 dark:bg-purple-400",
    iconColor: "text-purple-600 dark:text-purple-400",
    accent: "bg-purple-500 dark:bg-purple-400",
  },
  ps1: {
    label: "PS1",
    icon: "Disc",
    bg: "bg-indigo-500/10 dark:bg-indigo-400/10",
    border: "border-indigo-500/30 dark:border-indigo-400/25",
    dot: "bg-indigo-500 dark:bg-indigo-400",
    iconColor: "text-indigo-600 dark:text-indigo-400",
    accent: "bg-indigo-500 dark:bg-indigo-400",
  },
  ps2: {
    label: "PS2",
    icon: "Disc3",
    bg: "bg-blue-500/10 dark:bg-blue-400/10",
    border: "border-blue-500/30 dark:border-blue-400/25",
    dot: "bg-blue-500 dark:bg-blue-400",
    iconColor: "text-blue-600 dark:text-blue-400",
    accent: "bg-blue-500 dark:bg-blue-400",
  },
  ps3_360: {
    label: "PS3/360",
    icon: "Disc3",
    bg: "bg-green-500/10 dark:bg-green-400/10",
    border: "border-green-500/30 dark:border-green-400/25",
    dot: "bg-green-500 dark:bg-green-400",
    iconColor: "text-green-600 dark:text-green-400",
    accent: "bg-green-500 dark:bg-green-400",
  },
  wii: {
    label: "Wii",
    icon: "Gamepad2",
    bg: "bg-cyan-500/10 dark:bg-cyan-400/10",
    border: "border-cyan-500/30 dark:border-cyan-400/25",
    dot: "bg-cyan-500 dark:bg-cyan-400",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    accent: "bg-cyan-500 dark:bg-cyan-400",
  },
  modern: {
    label: "Modern",
    icon: "Sparkles",
    bg: "bg-violet-500/10 dark:bg-violet-400/10",
    border: "border-violet-500/30 dark:border-violet-400/25",
    dot: "bg-violet-500 dark:bg-violet-400",
    iconColor: "text-violet-600 dark:text-violet-400",
    accent: "bg-violet-500 dark:bg-violet-400",
  },
};

export const ERA_THEME_DEFAULT: EraThemeEntry = ERA_THEME.modern;

export type ArchetypeKey = "explorer" | "completionist" | "deep_diver";

/** Archetype: icon + short label; neutral chip (no era color). */
export const ARCHETYPE_THEME: Record<string, { icon: string; shortLabel: string }> = {
  explorer: { icon: "Compass", shortLabel: "Explorer" },
  completionist: { icon: "CheckCircle2", shortLabel: "Completionist" },
  deep_diver: { icon: "Waves", shortLabel: "Deep Diver" },
  achievement_hunter: { icon: "Trophy", shortLabel: "Achievement Hunter" },
  archivist: { icon: "Archive", shortLabel: "Archivist" },
  era_keeper: { icon: "Clock", shortLabel: "Era Keeper" },
  platform_loyalist: { icon: "Gamepad2", shortLabel: "Platform Loyalist" },
  variant_hunter: { icon: "Layers", shortLabel: "Variant Hunter" },
};

export type StrengthTier = "emerging" | "strong" | "core";

/** Copy per spec: "Emerging", "Strong", "Core" — no S-tier. */
export const STRENGTH_LABELS: Record<StrengthTier, string> = {
  emerging: "Emerging",
  strong: "Strong",
  core: "Core",
};

/** Strength pill: Emerging = outline muted, Strong = filled, Core = filled + subtle glow. */
export const STRENGTH_PILL_STYLES: Record<
  StrengthTier,
  { container: string; label?: string }
> = {
  emerging: {
    container:
      "border border-neutral-300 dark:border-white/20 bg-transparent text-neutral-600 dark:text-white/50",
  },
  strong: {
    container:
      "border border-neutral-300 dark:border-white/20 bg-neutral-200 dark:bg-white/10 text-neutral-800 dark:text-white/90",
  },
  core: {
    container:
      "border border-neutral-300 dark:border-white/20 bg-neutral-300 dark:bg-white/15 text-neutral-900 dark:text-white shadow-[0_0_12px_rgba(255,255,255,0.08)] dark:shadow-[0_0_12px_rgba(255,255,255,0.06)]",
  },
};
