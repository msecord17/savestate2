"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { pickCoverUrl } from "@/lib/images/cover";

export type GameCardProps = {
  game?: { cover_url?: string | null; canonical_title?: string | null } | null;
  release?: { cover_url?: string | null; display_title?: string | null } | null;
  title?: string;
};

export function GameCard({ game, release, title }: GameCardProps) {
  const initialSrc = useMemo(
    () =>
      pickCoverUrl({
        gameCover: game?.cover_url ?? null,
        releaseCover: release?.cover_url ?? null,
      }),
    [game?.cover_url, release?.cover_url]
  );

  const [src, setSrc] = useState(initialSrc);

  const displayTitle =
    title ??
    release?.display_title ??
    game?.canonical_title ??
    "Unknown title";

  return (
    <div className="rounded-2xl overflow-hidden bg-zinc-900/40 border border-white/5">
      <div className="relative w-full aspect-[16/9]">
        <Image
          src={src}
          alt={displayTitle}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 320px"
          onError={() => {
            // Prevent infinite loops: only swap if not already placeholder
            if (src !== "/img/cover-placeholder.png") {
              setSrc("/img/cover-placeholder.png");
            }
          }}
        />
      </div>

      <div className="p-3">
        <div className="text-sm font-medium truncate">{displayTitle}</div>
      </div>
    </div>
  );
}
