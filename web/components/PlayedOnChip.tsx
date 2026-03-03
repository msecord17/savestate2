"use client";

import { useEffect, useState } from "react";
import { chipClass } from "@/lib/chipStyles";

type Hardware = {
  slug: string;
  display_name: string;
};

export function PlayedOnChip({ releaseId }: { releaseId: string }) {
  const [loading, setLoading] = useState(true);
  const [hw, setHw] = useState<Hardware | null>(null);
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/portfolio/played-on/get?releaseId=${encodeURIComponent(releaseId)}`);
        const json = await res.json();
        if (!cancelled && json.ok) {
          setHw(json.primary ?? null);
          setSource(json.primary_source ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  useEffect(() => {
    function onUpdate(e: any) {
      if (e?.detail?.releaseId !== releaseId) return;
      fetch(`/api/portfolio/played-on/get?releaseId=${encodeURIComponent(releaseId)}`)
        .then((r) => r.json())
        .then((json) => {
          if (json.ok) {
            setHw(json.primary ?? null);
            setSource(json.primary_source ?? null);
          }
        });
    }
    window.addEventListener("played-on-updated", onUpdate);
    return () => window.removeEventListener("played-on-updated", onUpdate);
  }, [releaseId]);

  if (loading || !hw) return null;

  const isAuto = source === "ra_default" || source === "ra";

  return (
    <span className={chipClass}>
      <span className="opacity-75">Played on:</span>
      <span>{hw.display_name}</span>
      {isAuto && <span className="opacity-75">(Auto)</span>}
    </span>
  );
}
