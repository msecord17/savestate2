"use client";

import * as React from "react";

type GlassCardProps = {
  children: React.ReactNode;
  /** Optional max width: number (px) or Tailwind class (e.g. max-w-md) */
  maxWidth?: number | string;
  /** Additional className */
  className?: string;
};

export function GlassCard({
  children,
  maxWidth,
  className = "",
}: GlassCardProps) {
  const maxWidthStyle =
    typeof maxWidth === "number" ? { maxWidth } : undefined;
  const maxWidthClass =
    typeof maxWidth === "string" ? maxWidth : "";
  return (
    <div
      className={`rounded-[var(--radius)] border border-border bg-card p-4 ${maxWidthClass} ${className}`.trim()}
      style={maxWidthStyle}
    >
      {children}
    </div>
  );
}
