"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

type Hardware = {
  id: string;
  slug: string;
  display_name: string;
  manufacturer?: string | null;
  kind?: string;
  era_key?: string;
  is_modern_retro_handheld?: boolean;
  release_year?: number | null;
  model?: string | null;
};

export function PlayedOnSelect({ releaseId, hideLabel }: { releaseId: string; hideLabel?: boolean }) {
  const [selected, setSelected] = useState<Hardware | null>(null);
  const [open, setOpen] = useState(false);

  const [query, setQuery] = useState("");
  const dq = useDebouncedValue(query, 250);

  const [results, setResults] = useState<Hardware[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingPrimary, setLoadingPrimary] = useState(true);

  // preload current primary
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingPrimary(true);
      try {
        const res = await fetch(`/api/portfolio/played-on/get?releaseId=${encodeURIComponent(releaseId)}`);
        const json = await res.json();
        if (!cancelled) setSelected(json.ok ? json.primary : null);
      } finally {
        if (!cancelled) setLoadingPrimary(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [releaseId]);

  // search hardware
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/hardware/search?q=${encodeURIComponent(dq)}`);
      const json = await res.json();
      if (!cancelled) setResults(json.ok ? (json.results ?? []) : []);
    })();
    return () => {
      cancelled = true;
    };
  }, [dq]);

  async function setPlayedOn(slug: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/portfolio/played-on/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          release_id: releaseId,
          hardware_slug: slug,
          source: "manual",
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "save_failed");

      const hw = results.find((r) => r.slug === slug) ?? null;
      setSelected(hw);
      setOpen(false);
      setQuery("");
      window.dispatchEvent(new CustomEvent("played-on-updated", { detail: { releaseId } }));
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      const res = await fetch("/api/portfolio/played-on/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          release_id: releaseId,
          hardware_slug: null,
          source: "manual",
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "clear_failed");
      setSelected(null);
      setOpen(false);
      setQuery("");
      window.dispatchEvent(new CustomEvent("played-on-updated", { detail: { releaseId } }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {!hideLabel && <div className="text-sm font-medium">Played on</div>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="w-full rounded-md border px-3 py-2 text-left"
          onClick={() => setOpen((v) => !v)}
          disabled={loadingPrimary}
        >
          {loadingPrimary ? "Loading…" : selected ? selected.display_name : "Select hardware…"}
        </button>

        {selected && (
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm"
            onClick={clear}
            disabled={saving}
          >
            Clear
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-md border p-2 space-y-2">
          <input
            className="w-full rounded-md border px-3 py-2"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: SNES, Steam Deck, Odin…"
          />

          <div className="max-h-64 overflow-auto divide-y">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                className="w-full text-left px-2 py-2 hover:bg-neutral-50 disabled:opacity-50"
                disabled={saving}
                onClick={() => setPlayedOn(r.slug)}
              >
                <div className="font-medium">{r.display_name}</div>
                <div className="text-xs text-neutral-500">
                  {r.manufacturer ?? "—"} {r.kind ? `· ${r.kind}` : ""} {r.era_key ? `· ${r.era_key}` : ""}
                </div>
              </button>
            ))}
            {results.length === 0 && <div className="px-2 py-6 text-sm text-neutral-500">No results</div>}
          </div>
        </div>
      )}
    </div>
  );
}
