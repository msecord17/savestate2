"use client";

import { useEffect, useMemo, useState } from "react";

type IgdbPlatform = { name?: string; abbr?: string };
type IgdbResult = {
  provider: "igdb";
  igdb_game_id: number;
  title: string;
  summary: string | null;
  genres: string[];
  developer: string | null;
  publisher: string | null;
  cover_url: string | null;
  platforms: IgdbPlatform[];
};

export default function AddGamesPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<IgdbResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // store platform selection per igdb result
  const [platformChoice, setPlatformChoice] = useState<Record<string, string>>({});
  // per-result status messages
  const [msg, setMsg] = useState<Record<string, string>>({});

  const canSearch = q.trim().length >= 2;

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setErr("");
      return;
    }

    const t = setTimeout(async () => {
      try {
        setLoading(true);
        setErr("");

        const res = await fetch(`/api/search/igdb?q=${encodeURIComponent(q.trim())}`);
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;

        if (!res.ok) throw new Error(data?.error || `Search failed (${res.status})`);

        const rows: IgdbResult[] = Array.isArray(data?.results) ? data.results : [];
        setResults(rows);

        // set default platform per row to first platform if available
        const defaults: Record<string, string> = {};
        for (const r of rows) {
          const key = String(r.igdb_game_id);
          if (!platformChoice[key] && r.platforms?.length) {
            const p = r.platforms[0];
            defaults[key] = (p.abbr || p.name || "").toString();
          }
        }
        if (Object.keys(defaults).length) {
          setPlatformChoice((prev) => ({ ...prev, ...defaults }));
        }
      } catch (e: any) {
        setErr(e?.message || "Failed to search");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function createReleaseFromIgdb(r: IgdbResult) {
    const key = String(r.igdb_game_id);
    const chosen = (platformChoice[key] || "").trim();

    if (!chosen) {
      setMsg((prev) => ({ ...prev, [key]: "Pick a platform first." }));
      return;
    }

    // We send both abbr/name as the same string; server slugger handles it.
    const payload = {
      igdb_game_id: r.igdb_game_id,
      title: r.title,
      platform_name: chosen,
      platform_abbr: chosen,
      cover_url: r.cover_url,
      summary: r.summary,
      genres: r.genres,
      developer: r.developer,
      publisher: r.publisher,
    };

    try {
      setMsg((prev) => ({ ...prev, [key]: "Adding…" }));

      const res = await fetch("/api/releases/from-igdb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Add failed (${res.status})`);

      setMsg((prev) => ({ ...prev, [key]: data?.created ? "Added ✅" : "Already exists ✅" }));
    } catch (e: any) {
      setMsg((prev) => ({ ...prev, [key]: e?.message || "Add failed" }));
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 14 }}>Add Games</h1>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search IGDB (e.g., Chrono Trigger)"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
          }}
        />
      </div>

      {err && <div style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</div>}
      {loading && <div style={{ color: "#6b7280", marginBottom: 12 }}>Searching…</div>}

      <div style={{ display: "grid", gap: 12 }}>
        {results.map((r) => {
          const k = String(r.igdb_game_id);
          const selected = platformChoice[k] ?? "";
          const platforms = r.platforms ?? [];

          return (
            <div
              key={k}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 12,
                background: "white",
                display: "flex",
                gap: 12,
                overflow: "visible",
              }}
            >
              <div
                style={{
                  width: 90,
                  height: 120,
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "#f8fafc",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                {(() => {
                  const cover =
                    r.cover_url &&
                    !r.cover_url.includes("unknown.png") &&
                    !r.cover_url.includes("placeholder")
                      ? r.cover_url
                      : "/images/placeholder-cover.png";
                  return (
                    <img
                      src={cover}
                      alt={r.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  );
                })()}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{r.title}</div>

                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                  {r.summary ? r.summary.slice(0, 140) + (r.summary.length > 140 ? "…" : "") : "—"}
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
                  <select
                    value={selected}
                    onChange={(e) => setPlatformChoice((prev) => ({ ...prev, [k]: e.target.value }))}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      background: "white",
                    }}
                  >
                    {platforms.length === 0 ? (
                      <option value="">No platforms</option>
                    ) : (
                      <>
                        <option value="">Pick platform…</option>
                        {platforms.map((p, idx) => {
                          const label = (p.abbr || p.name || "").toString();
                          return (
                            <option key={`${k}-${idx}`} value={label}>
                              {label}
                            </option>
                          );
                        })}
                      </>
                    )}
                  </select>

                  <button
                    onClick={() => createReleaseFromIgdb(r)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      cursor: "pointer",
                      fontWeight: 800,
                    }}
                  >
                    Add
                  </button>

                  {msg[k] ? <div style={{ color: "#64748b", fontSize: 13 }}>{msg[k]}</div> : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
