/**
 * Mobile-first layout rules (non-negotiable). Use in components so they can't regress.
 * Enforce: tap target 44px, no hover-only, safe-area on drawer, no nested scroll in strip.
 */

/** Tailwind-compatible class: min 44px touch target. Use on all interactive chips/buttons. */
export const TOUCH_TARGET_CLASS = "min-h-[44px] min-w-[44px]";

/** Tailwind class: safe-area padding on drawer bottom (mobile). */
export const DRAWER_SAFE_AREA_BOTTOM_CLASS = "pb-[env(safe-area-inset-bottom)]";

/** Identity strip: single scroll container; no nested scroll inside the strip. */
export const IDENTITY_STRIP_SCROLL_CLASS =
  "overflow-x-auto overflow-y-hidden flex flex-nowrap gap-3 md:flex-wrap md:gap-4 -mx-4 px-4 md:mx-0 md:px-0";

export const LAYOUT_RULES = {
  touchTargetMinPx: 44,
  touchTargetClass: TOUCH_TARGET_CLASS,
  drawerSafeAreaBottom: DRAWER_SAFE_AREA_BOTTOM_CLASS,
  identityStripScroll: IDENTITY_STRIP_SCROLL_CLASS,
} as const;
