import type { Variants } from "framer-motion";

export const DUR = {
  tap: 0.12,
  fade: 0.16,
  exit: 0.2,
};

export const pressable = {
  whileTap: { scale: 0.98 },
  transition: { duration: DUR.tap },
};

export const hoverLift = {
  whileHover: { y: -1 },
  transition: { duration: DUR.tap },
};

// Drawer: backdrop fade + panel slide up (mobile-first bottom sheet)
export const drawerVariants: {
  backdrop: Variants;
  panel: Variants;
} = {
  backdrop: {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: DUR.fade } },
    exit: { opacity: 0, transition: { duration: DUR.fade } },
  },
  panel: {
    hidden: { opacity: 0, y: 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 420, damping: 34 },
    },
    exit: { opacity: 0, y: 10, transition: { duration: DUR.exit } },
  },
};

// Subsection "fade up" for drawer sections (Signals, Evolution, etc.)
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.18 },
  }),
};

/** ~120ms, easeOut — tap/press feedback (scale 0.98) */
export const pressTransition = { duration: 0.12, ease: "easeOut" as const };

export const press = {
  whileTap: { scale: 0.98 },
  transition: pressTransition,
};

/** Backdrop: opacity 0 → 1 in ~120ms */
export const drawerBackdropVariants: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.12 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
};

/** Panel: y 16 → 0, opacity 0 → 1; spring ~260–320ms. Close: y 0 → 10, opacity 0. */
export const drawerPanelVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 420, damping: 34 },
  },
  exit: { opacity: 0, y: 10, transition: { duration: 0.2 } },
};

/** Desktop: panel slides from right (x instead of y) */
export const drawerPanelDesktopVariants: Variants = {
  hidden: { opacity: 0, x: 24 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring", stiffness: 420, damping: 34 },
  },
  exit: { opacity: 0, x: 16, transition: { duration: 0.2 } },
};

/** When prefers-reduced-motion: instant show/exit (no animation) */
export const drawerBackdropVariantsReduced: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};

export const drawerPanelVariantsReduced: Variants = {
  hidden: { opacity: 1, y: 0 },
  show: { opacity: 1, y: 0, transition: { duration: 0 } },
  exit: { opacity: 0, y: 0, transition: { duration: 0 } },
};

export const drawerPanelDesktopVariantsReduced: Variants = {
  hidden: { opacity: 1, x: 0 },
  show: { opacity: 1, x: 0, transition: { duration: 0 } },
  exit: { opacity: 0, x: 0, transition: { duration: 0 } },
};

/** Section stagger: y 6 → 0, opacity 0 → 1; 40–60ms between groups */
export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.18, ease: "easeOut" },
  }),
};

/** New card / pagination: fade in + 6px rise, no delay by default */
export const newItemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: "easeOut" },
  },
};

/** Core strength dot: slow pulse 0.7 → 1 → 0.7. Only use when !useReducedMotion() — no constant loop without checking. */
export const coreDotPulse = {
  animate: {
    opacity: [0.7, 1, 0.7],
    transition: { duration: 2.8, repeat: Infinity, ease: "easeInOut" },
  },
};
