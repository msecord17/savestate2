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
  release_year?: number | null;
};

export default function DefaultRADeviceSettings() {
  const [current, setCurrent] = useState<Hardware | null>(null);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const dq = useDebouncedValue(query, 250);

  const [results, setResults] = useState<Hardware[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadCurrent() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/default-ra-hardware");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "load_failed");
      setCurrent(json.default ?? null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load default");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCurrent();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/hardware/search?q=${encodeURIComponent(dq)}`);
        const json = await res.json();
        if (!cancelled) setResults(json.ok ? (json.results ?? []) : []);
      } catch {
        if (!cancelled) setResults([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dq]);

  async function setDefault(slug: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/default-ra-hardware", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hardwareSlug: slug }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "save_failed");

      setCurrent(json.hardware);
      setOpen(false);
      setQuery("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save default");
    } finally {
      setSaving(false);
    }
  }

  async function clearDefault() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/default-ra-hardware", { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "clear_failed");
      setCurrent(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to clear default");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">RetroAchievements</div>
          <div className="text-sm text-neutral-500">
            Default device for auto &quot;Played on&quot; when RA syncs new releases.
          </div>
        </div>
      </div>

      <div className="rounded-lg border p-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-neutral-500">Default device</div>
          <div className="font-medium truncate">
            {loading ? "Loading…" : current ? current.display_name : "Not set"}
          </div>
          {current?.manufacturer && (
            <div className="text-xs text-neutral-500 truncate">{current.manufacturer}</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() => setOpen((v) => !v)}
            disabled={loading || saving}
          >
            {open ? "Close" : "Change"}
          </button>

          <button
            type="button"
            className="rounded-md border px-3 py-2 text-sm"
            onClick={clearDefault}
            disabled={loading || saving || !current}
            title="Clear default device"
          >
            Clear
          </button>
        </div>
      </div>

      {open && (
        <div className="rounded-lg border p-3 space-y-2">
          <input
            className="w-full rounded-md border px-3 py-2"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search hardware: Steam Deck, SNES, Odin…"
            disabled={saving}
          />

          <div className="max-h-64 overflow-auto divide-y rounded-md border">
            {results.map((r) => (
              <button
                key={r.id}
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-neutral-50 disabled:opacity-50"
                disabled={saving}
                onClick={() => setDefault(r.slug)}
              >
                <div className="font-medium">{r.display_name}</div>
                <div className="text-xs text-neutral-500">
                  {(r.manufacturer ?? "—") +
                    (r.kind ? ` · ${r.kind}` : "") +
                    (r.era_key ? ` · ${r.era_key}` : "")}
                </div>
              </button>
            ))}

            {results.length === 0 && (
              <div className="px-3 py-6 text-sm text-neutral-500">No results</div>
            )}
          </div>

          <div className="text-xs text-neutral-500">
            Tip: this only applies when a release has no primary Played-On already.
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600">
          {error.includes("unauthorized")
            ? "You're not logged in."
            : error}
        </div>
      )}
    </div>
  );
}
