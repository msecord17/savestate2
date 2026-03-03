"use client";

import { useState } from "react";
import Link from "next/link";
import { resolveCoverUrl } from "@/lib/images/resolveCoverUrl";
import { releaseHref } from "@/lib/routes";

export type MemoryTileItem = {
  id: string;
  display_title: string;
  platform_key: string | null;
  cover_url: string | null;
  release_date: string | null;
  first_release_year: number | null;
};

type MemoryTileProps = {
  item: MemoryTileItem;
  remembered?: boolean;
  onRememberChange?: (releaseId: string, remembered: boolean) => void;
};

export function MemoryTile({ item, remembered = false, onRememberChange }: MemoryTileProps) {
  const [loading, setLoading] = useState(false);
  const [localRemembered, setLocalRemembered] = useState(remembered);

  const isRemembered = localRemembered;

  async function handleRemember(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (loading) return;

    setLoading(true);
    try {
      if (isRemembered) {
        const res = await fetch(
          `/api/memory/remember?release_id=${encodeURIComponent(item.id)}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          setLocalRemembered(false);
          onRememberChange?.(item.id, false);
        }
      } else {
        const res = await fetch("/api/memory/remember", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            release_id: item.id,
            platform_key: item.platform_key ?? null,
          }),
        });
        if (res.ok) {
          setLocalRemembered(true);
          onRememberChange?.(item.id, true);
        } else if (res.status === 401) {
          window.location.href = "/login";
        }
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="group relative flex flex-col">
      <Link href={releaseHref(item.id)} className="flex flex-col">
        <div className="aspect-[3/4] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5">
          <img
            src={resolveCoverUrl({
              cover_url: item.cover_url,
              platform_key: item.platform_key,
            })}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        </div>
        <p className="mt-1.5 line-clamp-2 text-xs font-medium text-slate-900 dark:text-white">
          {item.display_title}
        </p>
        {item.first_release_year && (
          <p className="text-[11px] text-slate-500 dark:text-white/50">
            {item.first_release_year}
          </p>
        )}
      </Link>

      <button
        type="button"
        onClick={handleRemember}
        disabled={loading}
        className={`absolute right-1 top-1 rounded px-2 py-0.5 text-[10px] font-medium transition ${
          isRemembered
            ? "bg-emerald-500/90 text-white"
            : "bg-black/50 text-white/90 hover:bg-black/70"
        } disabled:opacity-50`}
      >
        {loading ? "…" : isRemembered ? "Remembered" : "I remember this"}
      </button>
    </div>
  );
}
