/**
 * Design tokens — semantic roles. Use these instead of raw hex in UI.
 * No hex in components; reference tokens only.
 */

export const tokens = {
  /** Surfaces */
  background: "var(--color-background)",
  backgroundMuted: "var(--color-background-muted)",
  surface: "var(--color-surface)",
  surfaceHover: "var(--color-surface-hover)",

  /** Text */
  text: "var(--color-text)",
  textMuted: "var(--color-text-muted)",
  textInverse: "var(--color-text-inverse)",

  /** Borders */
  border: "var(--color-border)",
  borderStrong: "var(--color-border-strong)",

  /** Interactive */
  interactive: "var(--color-interactive)",
  interactiveHover: "var(--color-interactive-hover)",
  interactiveActive: "var(--color-interactive-active)",

  /** Semantic */
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  error: "var(--color-error)",
  info: "var(--color-info)",

  /** Touch target minimum (px). Enforce ≥44 for mobile. */
  touchTargetMin: 44,

  /** Spacing scale (px) */
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
  },

  /** Radii */
  radius: {
    sm: 6,
    md: 8,
    lg: 12,
    full: 9999,
  },
} as const;

export type Tokens = typeof tokens;
