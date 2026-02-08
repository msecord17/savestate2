"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Candidate = {
  igdb_game_id: number;
  title: string;
  score: number;
  cover_url: string | null;
  first_release_year: number | null;
};

type Meta = {
  raw_title?: string;
  candidates?: Candidate[];
};

type Match = {
  id: string;
  source: string;
  external_id: string;
  source_title?: string | null;
  source_platform?: string | null;
  source_cover_url?: string | null;
  igdb_game_id: number | null;
  status: string;
  confidence: number | null;
  matched_name: string | null;
  matched_year: number | null;
  meta: Meta | null;
  created_at: string;
};

function normalizeCover(url: string | null): string {
  if (!url) return "";
  const u = url.startsWith("//") ? `https:${url}` : url;
  return u.replace("t_thumb", "t_cover_big");
}

export default function AdminMatchesPage() {
  const [status, setStatus] = useState("needs_review");
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/matches?status=${encodeURIComponent(status)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setMatches(Array.isArray(data?.matches) ? data.matches : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  async function approve(mappingId: string, igdbGameId: number) {
    setActing(mappingId);
    try {
      const res = await fetch(`/api/admin/matches/${mappingId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ igdb_game_id: igdbGameId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setMatches((prev) => prev.filter((m) => m.id !== mappingId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setActing(null);
    }
  }

  async function reject(mappingId: string) {
    setActing(mappingId);
    try {
      const res = await fetch(`/api/admin/matches/${mappingId}/reject`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setMatches((prev) => prev.filter((m) => m.id !== mappingId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Reject failed");
    } finally {
      setActing(null);
    }
  }

  const candidates = (meta: Meta | null): Candidate[] => {
    const list = meta?.candidates ?? [];
    return list.slice(0, 5);
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)] p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/gamehome"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            ← Back
          </Link>
          <h1 className="text-xl font-semibold">Match review</h1>
        </div>

        <div className="flex gap-2 mb-4">
          {["candidate", "needs_review", "rejected", "confirmed", "auto_approved", "manual"].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded text-sm ${
                status === s
                  ? "bg-[var(--color-interactive)] text-white"
                  : "bg-[var(--color-surface)] border border-[var(--color-border)]"
              }`}
            >
              {s.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        {loading && <p className="text-[var(--color-text-muted)]">Loading…</p>}
        {error && <p className="text-[var(--color-error)]">{error}</p>}
        {!loading && !error && matches.length === 0 && (
          <p className="text-[var(--color-text-muted)]">No matches with status “{status}”.</p>
        )}

        <ul className="space-y-6">
          {matches.map((m) => {
            const rawTitle = m.meta?.raw_title ?? m.matched_name ?? `${m.source} / ${m.external_id}`;
            const list = candidates(m.meta);
            const busy = acting === m.id;

            return (
              <li
                key={m.id}
                className="border border-[var(--color-border)] rounded-lg p-4 bg-[var(--color-surface)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-medium text-[var(--color-text)]">{rawTitle}</p>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {m.source} · {m.external_id}
                      {m.confidence != null && ` · ${(Number(m.confidence) * 100).toFixed(0)}%`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => reject(m.id)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded text-sm bg-[var(--color-error)]/10 text-[var(--color-error)] hover:bg-[var(--color-error)]/20 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>

                <p className="text-sm text-[var(--color-text-muted)] mb-2">Pick one (or reject):</p>
                <div className="flex flex-wrap gap-3">
                  {list.map((c) => (
                    <button
                      key={c.igdb_game_id}
                      type="button"
                      onClick={() => approve(m.id, c.igdb_game_id)}
                      disabled={busy}
                      className="flex flex-col items-center w-28 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] hover:border-[var(--color-interactive)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50 text-left transition-colors"
                    >
                      <div className="w-full aspect-[3/4] rounded-t-lg overflow-hidden bg-[var(--color-surface)]">
                        {c.cover_url ? (
                          <img
                            src={normalizeCover(c.cover_url)}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[var(--color-text-muted)] text-xs">
                            No cover
                          </div>
                        )}
                      </div>
                      <div className="p-2 w-full">
                        <p className="text-xs font-medium text-[var(--color-text)] truncate" title={c.title}>
                          {c.title}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {c.first_release_year ?? "—"} · {(c.score * 100).toFixed(0)}%
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
                {list.length === 0 && (
                  <p className="text-sm text-[var(--color-text-muted)]">No candidates. Reject or run matcher again.</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
