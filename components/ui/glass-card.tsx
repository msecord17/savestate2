import * as React from "react";
import clsx from "clsx";

type Props = React.HTMLAttributes<HTMLDivElement> & {
  interactive?: boolean;
};

export function GlassCard({ className, interactive = false, ...props }: Props) {
  return (
    <div
      className={clsx(
        // LIGHT MODE default
        "rounded-xl border border-black/10 bg-white text-slate-900 shadow-sm",
        // DARK MODE support (if you ever enable it)
        "dark:border-white/10 dark:bg-white/[0.06] dark:text-white/85 dark:shadow-none",
        "transition",
        interactive &&
          [
            // LIGHT hover: subtle bg + border, no full white
            "hover:bg-black/[0.03] hover:border-black/20 hover:shadow-sm",
            // DARK hover: slight bg opacity + border, keep text readable
            "dark:hover:bg-white/[0.10] dark:hover:border-white/25 dark:hover:shadow-md dark:hover:shadow-black/20",
          ].join(" "),
        className
      )}
      {...props}
    />
  );
}
