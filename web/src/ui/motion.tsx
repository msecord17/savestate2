"use client";

/**
 * Micro-motion: motion component, hooks, and re-exports from motion-variants.
 * Constants live in @/src/ui/motion-variants (no JSX, no React).
 */

import * as React from "react";
import { motion, useReducedMotion as useFramerReducedMotion } from "framer-motion";
import { pressTransition } from "./motion-variants";

export { motion };
export const useReducedMotion = useFramerReducedMotion;

export {
  fadeUp,
  drawerVariants,
  pressable,
  hoverLift,
  pressTransition,
} from "./motion-variants";

/** Wrapper: press feedback (scale 0.98 on tap). Use for strip, signal pills, etc. */
export function MotionButton({
  children,
  className,
  onClick,
  disabled,
  "aria-label": ariaLabel,
  ...rest
}: React.ComponentProps<typeof motion.button>) {
  const reduced = useReducedMotion();
  return (
    <motion.button
      type="button"
      whileTap={reduced ? undefined : { scale: 0.98 }}
      transition={pressTransition}
      className={className}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      {...rest}
    >
      {children}
    </motion.button>
  );
}
