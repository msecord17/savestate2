"use client";

import { useCallback, useState } from "react";
import Link from "next/link";

const PLATFORMS = ["steam", "steam_enrich", "psn", "xbox", "ra"];

export default function AdminSyncRunsPage() {
  const [detailPlatform, setDetailPlatform] = useState<string | null>(null);
  const [detailRun, setDetailRun] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const viewDetails = useCallback(async (platform: string) => {
    setLoading(true);
    setError("");
    setDetailPlatform(platform);
    setDetailRun(null);
    try {
      const res = await fetch(
        `/api/admin/sync-runs?platform=${encodeURIComponent(platform)}&limit=1`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      const runs = Array.isArray(data?.rows) ? data.rows : [];
      setDetailRun(runs[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold">Sync runs</h1>
          <Link href="/admin" className="px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-sm">
            ← Admin
          </Link>
        </div>

        <p className="text-white/60 text-sm mb-4">
          View the newest run per platform. Sync handlers write to sync_runs; no separate logging route.
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {PLATFORMS.map((p) => (
            <button
              key={p}
              onClick={() => viewDetails(p)}
              disabled={loading}
              className="px-3 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-mono disabled:opacity-50"
            >
              View details: {p}
            </button>
          ))}
        </div>

        {error ? (
          <div className="text-red-300 mb-4">{error}</div>
        ) : null}

        {loading ? (
          <div className="text-white/60">Loading…</div>
        ) : detailRun ? (
          <pre className="rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-white/70 overflow-auto max-h-[70vh]">
            {JSON.stringify(detailRun, null, 2)}
          </pre>
        ) : detailPlatform ? (
          <div className="text-white/50 text-sm">No runs for {detailPlatform}.</div>
        ) : (
          <div className="text-white/50 text-sm">Click a platform to view its newest run.</div>
        )}
      </div>
    </div>
  );
}
