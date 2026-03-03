"use client";

import * as React from "react";

type PillProps = {
  children: React.ReactNode;
  /** Background color (CSS value). Default: surface-2 */
  bg?: string;
  /** Additional className */
  className?: string;
};

export function Pill({ children, bg = "var(--surface-2)", className = "" }: PillProps) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: "var(--r-full)",
        border: "1px solid var(--border)",
        background: bg,
        fontSize: 12,
        fontWeight: 600,
        color: "var(--text)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
