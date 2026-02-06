"use client";

import { tokens } from "@/src/design";

/**
 * Two-pane layout for tablet: list left, detail right.
 * Use at tablet breakpoint (e.g. md:). Single column on mobile.
 */
export function TwoPane({
  list,
  detail,
  className = "",
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 md:gap-6 ${className}`}
      style={{ gap: tokens.space[4] }}
    >
      <aside className="min-w-0 md:min-h-0 md:overflow-y-auto">{list}</aside>
      <section className="min-w-0 md:min-h-0 md:overflow-y-auto">{detail}</section>
    </div>
  );
}
