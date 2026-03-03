"use client";

import Link from "next/link";

type ShareCardPreviewVm = {
  user: { username?: string | null };
  lifetimeScore: number | null;
  primaryArchetype: { label?: string } | null;
};

type ShareCardPreviewProps = {
  vm: ShareCardPreviewVm;
  className?: string;
};

/** Static preview CTA for the shareable identity card (screenshot view at /u/[username]/card). */
export function ShareCardPreview({ vm, className = "" }: ShareCardPreviewProps) {
  return (
    <section className={className}>
      <p className="text-xs text-white/50 mb-2">Share identity card</p>
      <div className="rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="text-sm text-white/80">
          @{vm.user?.username}
          {(vm.lifetimeScore != null || vm.primaryArchetype) && (
            <> · Score {Intl.NumberFormat().format(vm.lifetimeScore ?? 0)} · {vm.primaryArchetype?.label ?? "—"}</>
          )}
        </p>
        <Link
          href={`/users/${encodeURIComponent(vm.user?.username ?? "")}/card`}
          className="inline-block mt-2 text-sm text-sky-400 hover:underline"
        >
          Open card (screenshot view)
        </Link>
      </div>
    </section>
  );
}
