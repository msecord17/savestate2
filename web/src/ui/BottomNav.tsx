"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { tokens } from "@/src/design";

const NAV_ITEMS = [
  { href: "/gamehome", label: "Home" },
  { href: "/my-portfolio", label: "Portfolio" },
  { href: "/profile", label: "Profile" },
  { href: "/lists", label: "Lists" },
] as const;

/**
 * Bottom nav for mobile — single nav model. Min 44px touch targets.
 * Visible on small viewports; hide on desktop (use top nav there).
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      role="navigation"
      aria-label="Main"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--color-border)] bg-[var(--color-surface)] md:hidden"
      style={{
        minHeight: tokens.touchTargetMin + 8,
        paddingBottom: "env(safe-area-inset-bottom, 0)",
      }}
    >
      <ul className="flex h-full items-center justify-around">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = pathname === href || (href !== "/gamehome" && pathname?.startsWith(href));
          return (
            <li key={href}>
              <Link
                href={href}
                className="flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 px-3 py-2 text-xs font-medium transition-colors active:bg-[var(--color-surface-hover)]"
                style={{ color: active ? "var(--color-interactive)" : "var(--color-text-muted)" }}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
