"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";

type MissRow = {
  query: string;
  misses: number;
  last_seen: string;
};

type HardwareResult = {
  id: string;
  slug: string;
  display_name: string;
  manufacturer?: string | null;
  kind?: string | null;
  era_key?: string | null;
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function aliasSql(query: string): string {
  const escaped = query.replace(/'/g, "''");
  return `insert into public.hardware_aliases (hardware_id, alias)
values ('<HARDWARE_UUID>'::uuid, '${escaped}')
on conflict (hardware_id, alias) do nothing;`;
}

export default function AdminHardwareMissesPage() {
  const [rows, setRows] = useState<MissRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // "Fix this miss" panel state
  const [selectedMiss, setSelectedMiss] = useState<string>("");
  const [hwQuery, setHwQuery] = useState<string>("");
  const [hwResults, setHwResults] = useState<HardwareResult[]>([]);
  const [hwLoading, setHwLoading] = useState(false);
  const [hwError, setHwError] = useState("");

  const [toast, setToast] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/hardware/misses?days=14&limit=50", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setRows(Array.isArray(data?.rows) ? data.rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Debounced hardware search
  useEffect(() => {
    const q = hwQuery.trim();
    setHwError("");

    if (!q) {
      setHwResults([]);
      return;
    }

    const t = setTimeout(async () => {
      setHwLoading(true);
      try {
        const res = await fetch(`/api/hardware/search?q=${encodeURIComponent(q)}&limit=12`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || res.statusText);
        setHwResults(Array.isArray(data?.results) ? data.results : []);
      } catch (e) {
        setHwResults([]);
        setHwError(e instanceof Error ? e.message : "Hardware search failed");
      } finally {
        setHwLoading(false);
      }
    }, 200);

    return () => clearTimeout(t);
  }, [hwQuery]);

  const copyAliasSql = (query: string) => {
    const sql = aliasSql(query);
    navigator.clipboard.writeText(sql).then(() => {
      setCopied(query);
      setTimeout(() => setCopied(null), 1500);
    });
  };

  const onPickMiss = (q: string) => {
    setSelectedMiss(q);
    setHwQuery(q);
    setToast("");
  };

  const addAlias = async (hardware_id: string) => {
    if (!selectedMiss) return;

    setAddingFor(hardware_id);
    setToast("");

    try {
      const res = await fetch("/api/admin/hardware/alias/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hardware_id, alias: selectedMiss }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);

      setToast(`Added alias "${selectedMiss}" ✅`);

      setRows((prev) => prev.filter((r) => r.query !== selectedMiss));
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to add alias");
    } finally {
      setAddingFor(null);
      setTimeout(() => setToast(""), 2500);
    }
  };

  const ignoreMiss = async (query: string) => {
    setToast("");
    try {
      const res = await fetch("/api/admin/hardware/misses/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);

      setRows((prev) => prev.filter((r) => r.query !== query));
      setToast(`Ignored "${query}" 🫥`);
      setTimeout(() => setToast(""), 2000);
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Failed to ignore");
      setTimeout(() => setToast(""), 2500);
    }
  };

  const selectedRow = useMemo(
    () => rows.find((r) => r.query === selectedMiss) ?? null,
    [rows, selectedMiss]
  );

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/admin/matches" className="text-sm text-sky-400 hover:underline">
              ← Admin
            </Link>
            <h1 className="text-xl font-semibold">Hardware search misses</h1>
          </div>

          <button
            type="button"
            onClick={fetchRows}
            className="px-3 py-1.5 rounded border border-border bg-card text-xs font-medium hover:bg-accent/20 transition-colors"
          >
            Refresh
          </button>
        </div>

        {loading && <p className="text-muted-foreground">Loading…</p>}
        {error && <p className="text-red-400">{error}</p>}

        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: misses table */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="text-left p-3 font-medium">Query</th>
                    <th className="text-right p-3 font-medium">Misses</th>
                    <th className="text-left p-3 font-medium">Last seen</th>
                    <th className="p-3 w-36"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-muted-foreground">
                        No misses in the last 14 days.
                      </td>
                    </tr>
                  ) : (
                    rows.map((r) => {
                      const isSelected = r.query === selectedMiss;
                      return (
                        <tr
                          key={r.query}
                          className={[
                            "border-b border-border hover:bg-card cursor-pointer",
                            isSelected ? "bg-accent/10" : "",
                          ].join(" ")}
                          onClick={() => onPickMiss(r.query)}
                        >
                          <td className="p-3 font-mono text-foreground">{r.query}</td>
                          <td className="p-3 text-right">{r.misses}</td>
                          <td className="p-3 text-muted-foreground">{formatDate(r.last_seen)}</td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyAliasSql(r.query);
                              }}
                              className="px-3 py-1.5 rounded border border-border bg-card text-xs font-medium hover:bg-accent/20 transition-colors"
                            >
                              {copied === r.query ? "Copied!" : "Copy SQL"}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                ignoreMiss(r.query);
                              }}
                              className="ml-2 px-3 py-1.5 rounded border border-border bg-card text-xs font-medium hover:bg-accent/20 transition-colors"
                            >
                              Ignore
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Right: fix panel */}
            <div className="rounded-lg border border-border p-4 bg-card">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-sm text-muted-foreground">Selected miss</div>
                  <div className="font-mono text-foreground">
                    {selectedMiss ? selectedMiss : "—"}
                  </div>
                </div>
                {selectedRow && (
                  <div className="text-xs text-muted-foreground text-right">
                    <div>misses: {selectedRow.misses}</div>
                    <div>last: {formatDate(selectedRow.last_seen)}</div>
                  </div>
                )}
              </div>

              <div className="mb-3">
                <label className="block text-xs text-muted-foreground mb-1">Search hardware to attach alias</label>
                <input
                  value={hwQuery}
                  onChange={(e) => setHwQuery(e.target.value)}
                  placeholder="Type to search hardware…"
                  className="w-full rounded bg-card border border-border px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <div className="mt-1 text-xs text-muted-foreground/80">
                  Tip: click a miss row to auto-fill this.
                </div>
              </div>

              {toast && (
                <div className="mb-3 text-sm">
                  <span className={toast.includes("✅") || toast.includes("🫥") ? "text-emerald-400" : "text-red-400"}>
                    {toast}
                  </span>
                </div>
              )}

              {hwLoading && <p className="text-muted-foreground text-sm">Searching…</p>}
              {hwError && <p className="text-red-400 text-sm">{hwError}</p>}

              {!hwLoading && !hwError && (
                <div className="space-y-2">
                  {hwResults.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      {hwQuery.trim() ? "No hardware results." : "Pick a miss to start."}
                    </p>
                  ) : (
                    hwResults.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between gap-3 rounded border border-border bg-card p-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{h.display_name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {h.manufacturer ? `${h.manufacturer} • ` : ""}
                            {h.kind ?? "—"} • {h.era_key ?? "—"} • <span className="font-mono">{h.slug}</span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={!selectedMiss || addingFor === h.id}
                          onClick={() => addAlias(h.id)}
                          className="shrink-0 px-3 py-1.5 rounded border border-border bg-card text-xs font-medium hover:bg-accent/20 transition-colors disabled:opacity-50 disabled:hover:bg-card"
                        >
                          {addingFor === h.id ? "Adding…" : "Add alias"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
