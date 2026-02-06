"use client";

import * as React from "react";

type Props = {
  tag: string;
  icon: React.ReactNode; // whatever icon system you use
  subtle?: boolean;
};

export function EvolutionLine({ tag, icon, subtle }: Props) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <div className="shrink-0">{icon}</div>
      <div
        className={`text-sm ${subtle ? "text-neutral-500 dark:text-white/60" : "text-neutral-700 dark:text-white/80"}`}
      >
        {tag}
      </div>
    </div>
  );
}
