"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { drawerVariants } from "@/src/ui/motion";
import { useReducedMotion } from "framer-motion";
import { ERA_THEME, ERA_THEME_DEFAULT } from "@/lib/identity/strip-themes";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  children: React.ReactNode;
  /** Optional: era key for tiny left accent bar in header (era-coded color) */
  eraKey?: string | null;
};

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

const desktopPanelVariants = {
  hidden: { opacity: 0, x: 24 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 420, damping: 34 },
  },
  exit: { opacity: 0, x: 16, transition: { duration: 0.2 } },
};

export function ArchetypeDrawerShell({ open, onOpenChange, title, children, eraKey }: Props) {
  const isDesktop = useIsDesktop();
  const reduce = useReducedMotion();

  const eraTheme = eraKey ? ERA_THEME[eraKey] ?? ERA_THEME_DEFAULT : null;

  const backdropClass = isDesktop ? "fixed inset-0 z-40 bg-black/50" : "fixed inset-0 z-40 bg-black/55";
  const panelVariants = isDesktop ? desktopPanelVariants : drawerVariants.panel;
  const backdropVariants = reduce ? { hidden: { opacity: 0 }, show: { opacity: 1, transition: { duration: 0 } }, exit: { opacity: 0, transition: { duration: 0 } } } : drawerVariants.backdrop;
  const panelVariantsMaybeReduce = reduce ? { hidden: { opacity: 1, y: 0, x: 0 }, show: { opacity: 1, y: 0, x: 0, transition: { duration: 0 } }, exit: { opacity: 0, transition: { duration: 0 } } } : panelVariants;

  return (
    <motion.div
      key="archetype-drawer"
      variants={panelVariantsMaybeReduce}
      initial="hidden"
      animate="show"
      exit="exit"
      className="fixed inset-0 z-40"
      role="presentation"
    >
      <motion.div
        variants={backdropVariants}
        initial="hidden"
        animate="show"
        className={cn("absolute inset-0", backdropClass)}
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div
        className={cn(
          isDesktop
            ? "fixed top-0 right-0 z-50 h-dvh w-[420px] max-w-[92vw] bg-zinc-950 border-l border-white/10"
            : "fixed inset-0 z-50 h-dvh bg-zinc-950 border-t border-white/10 rounded-t-3xl flex flex-col"
        )}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {isDesktop ? (
          <>
            <div className={cn("flex items-center gap-2 border-b border-white/10 px-5 py-4 min-h-[44px]")}>
              {eraTheme ? (
                <div className={cn("w-1 rounded-full shrink-0 self-stretch min-h-[36px]", eraTheme.accent)} aria-hidden />
              ) : null}
              <div className="flex items-center justify-between flex-1 min-w-0 gap-2">
                <div className="text-base font-semibold text-white truncate">{title}</div>
                <button
                  type="button"
                  className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl hover:bg-white/5 active:bg-white/10 flex items-center justify-center shrink-0 touch-manipulation"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto h-[calc(100dvh-65px)]">{children}</div>
          </>
        ) : (
          <>
            <div className={cn("flex gap-2 px-5 pt-4 pb-2 min-h-[44px] shrink-0", eraTheme && "items-stretch")}>
              {eraTheme ? (
                <div className={cn("w-1 rounded-full shrink-0 mt-1 min-h-[32px]", eraTheme.accent)} aria-hidden />
              ) : null}
              <div className="flex-1 min-w-0">
                <div className="mx-auto h-1 w-10 rounded-full bg-white/15" />
                <div className="flex items-center justify-between mt-3 gap-2">
                  <div className="text-base font-semibold text-white truncate">{title}</div>
                  <button
                    type="button"
                    className="h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl hover:bg-white/5 active:bg-white/10 flex items-center justify-center shrink-0 touch-manipulation"
                    onClick={() => onOpenChange(false)}
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-6 min-h-0 pb-[env(safe-area-inset-bottom)]">
              {children}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
