"use client";

import * as React from "react";

type PageShellProps = {
  children: React.ReactNode;
  /** Max width: number (px) or Tailwind class (e.g. max-w-5xl). Default max-w-5xl. */
  maxWidth?: number | string;
  /** Padding override: number (px). Default px-6 py-6. */
  padding?: number;
  /** Additional className */
  className?: string;
  /** Inline style overrides (e.g. fontFamily) */
  style?: React.CSSProperties;
};

export function PageShell({
  children,
  maxWidth = "max-w-5xl",
  padding,
  className = "",
  style = {},
}: PageShellProps) {
  const isNum = typeof maxWidth === "number";
  const maxWidthClass = isNum ? "" : maxWidth;
  const contentStyle: React.CSSProperties = {
    ...(isNum ? { maxWidth } : {}),
    ...(padding != null ? { padding } : {}),
  };
  return (
    <div
      className={`min-h-screen bg-background text-foreground ${className}`}
      style={Object.keys(style).length ? style : undefined}
    >
      <div
        className={`mx-auto ${maxWidthClass || "max-w-5xl"} ${padding != null ? "" : "px-6 py-6"}`}
        style={Object.keys(contentStyle).length ? contentStyle : undefined}
      >
        {children}
      </div>
    </div>
  );
}
