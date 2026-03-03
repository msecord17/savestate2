"use client";

import { useEffect, useState } from "react";
import IdentityShareCard from "@/components/identity/IdentityShareCard";
import { eraLabel, eraYears } from "@/lib/identity/eras";
import type { EraTimelineItem, TimelineResponse } from "@/lib/identity/types";

type ShareApiResponse = {
  ok: boolean;
  card: Parameters<typeof IdentityShareCard>[0]["data"];
  timeline?: TimelineResponse;
};

function normalizeCover(url: string | null): string {
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url;
}

export default function ShareWithTimeline({ shareId }: { shareId: string }) {
  const [data, setData] = useState<ShareApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/identity/share/${encodeURIComponent(shareId)}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? "Not found" : "Failed to load");
        return res.json();
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <p className="text-white/80">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <p className="text-white/60">Loading…</p>
      </div>
    );
  }

  const t = data?.timeline ?? data;
  const eras = (t as { eras?: EraTimelineItem[] })?.eras ?? [];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-[560px] px-4 py-10">
        <IdentityShareCard data={data.card} />

        {eras.length > 0 && (
          <div className="mt-10">
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-4">
              Timeline by era
            </h2>
            <div className="space-y-3">
              {eras.map((era: EraTimelineItem) => (
                <div
                  key={era.era}
                  className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-white">
                      {eraLabel(era.era)}
                    </span>
                    <span className="text-xs text-white/50">{eraYears(era.era)}</span>
                  </div>
                  <p className="text-xs text-white/50 mb-3">
                    {era.games} games · {era.releases} releases
                  </p>
                  {era.notable.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {era.notable.slice(0, 3).map((n) => (
                        <div
                          key={n.release_id}
                          className="flex-shrink-0 w-20 text-center"
                        >
                          {n.cover_url ? (
                            <img
                              src={normalizeCover(n.cover_url)}
                              alt=""
                              className="w-16 h-16 mx-auto rounded object-cover"
                            />
                          ) : (
                            <div className="w-16 h-16 mx-auto rounded bg-white/10" />
                          )}
                          <p className="text-xs text-white/80 truncate mt-1" title={n.title}>
                            {n.title}
                          </p>
                          {n.played_on && (
                            <p className="text-[10px] text-white/50 truncate">{n.played_on}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
