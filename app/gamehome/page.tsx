"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type GameMeta = {
  summary?: string | null;
  genres?: string[] | null;
  developer?: string | null;
  publisher?: string | null;
  first_release_year?: number | null;
};

type Release = {
  id: string;
  display_title: string | null;
  platform_name: string | null;
  platform_key: string | null;
  cover_url?: string | null;
  games?: GameMeta | null;
};

type Item = {
  entry_id?: string;
  release_id: string;
  status: string;
  playtime_minutes?: number | null;
  last_played_at?: string | null;
  updated_at?: string;
  releases: Release | null;
};

type Section = {
  key: string;
  title: string;
  items: Item[];
};

export default function GameHomePage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [curatedLists, setCuratedLists] = useState<any[]>([]);
  const [myLists, setMyLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        setLoading(true);
        setErr("");

        // 1) GameHome sections
        const ghRes = await fetch("/api/gamehome");
        const ghText = await ghRes.text();
        const ghData = ghText ? JSON.parse(ghText) : null;
        if (!ghRes.ok) throw new Error(ghData?.error || `Failed (status ${ghRes.status})`);

        // 2) Curated lists
        const curatedRes = await fetch("/api/lists/curated");
        const curatedText = await curatedRes.text();
        const curatedData = curatedText ? JSON.parse(curatedText) : null;

        // 3) Your lists
        const mineRes = await fetch("/api/lists/mine");
        const mineText = await mineRes.text();
        const mineData = mineText ? JSON.parse(mineText) : null;

        if (cancelled) return;

        setSections(Array.isArray(ghData?.sections) ? ghData.sections : []);
        setCuratedLists(Array.isArray(curatedData) ? curatedData : []);
        setMyLists(Array.isArray(mineData) ? mineData : []);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Failed to load GameHome");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <div style={{ padding: 24, color: "#6b7280" }}>Loading…</div>;
  }

  if (err) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</div>
        <div>
          If you’re not logged in: <Link href="/login">Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <style>{`
        .row {
          display: flex;
          gap: 12px;
          overflow-x: auto;
          padding-bottom: 8px;
          scroll-snap-type: x mandatory;
        }
        .card {
          min-width: 220px;
          max-width: 220px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 12px;
          background: white;
          scroll-snap-align: start;
          transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
        }
        .card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(0,0,0,0.08);
          border-color: #cbd5e1;
        }
        .pill {
          display: inline-flex;
          gap: 6px;
          align-items: center;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          font-size: 12px;
          color: #334155;
          background: #f8fafc;
        }
        .listCard {
          min-width: 260px;
          max-width: 260px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 12px;
          background: white;
          scroll-snap-align: start;
          transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
        }
        .listCard:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(0,0,0,0.08);
          border-color: #cbd5e1;
        }

        /* Animated premium edge on hover */
        .shimmerBtn {
          position: relative;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          padding: 8px 10px;
          background: white;
          cursor: pointer;
          font-weight: 900;
          isolation: isolate;
        }
        .shimmerBtn::before {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          padding: 2px;
          background: conic-gradient(
            from 0deg,
            rgba(167, 139, 250, 1),
            rgba(203, 213, 225, 1),
            rgba(167, 139, 250, 1),
            rgba(203, 213, 225, 1),
            rgba(167, 139, 250, 1)
          );
          -webkit-mask: 
            linear-gradient(#fff 0 0) content-box, 
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          transition: opacity 200ms ease;
          pointer-events: none;
          z-index: -1;
        }
        .shimmerBtn::after {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          padding: 2px;
          background: conic-gradient(
            from 180deg,
            transparent 0%,
            transparent 40%,
            rgba(255, 255, 255, 0.6) 50%,
            transparent 60%,
            transparent 100%
          );
          -webkit-mask: 
            linear-gradient(#fff 0 0) content-box, 
            linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          pointer-events: none;
          z-index: -1;
        }
        .shimmerBtn:hover::before {
          opacity: 1;
        }
        .shimmerBtn:hover::after {
          opacity: 1;
          animation: shimmerRotate 2s linear infinite;
        }
        @keyframes shimmerRotate {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 26, marginBottom: 6 }}>GameHome</h1>
        <span style={{ color: "#6b7280" }}>Your library, distilled.</span>
      </div>

      <div style={{ color: "#6b7280", marginBottom: 18 }}>
        Short lists based on what you play and what you’ve been ignoring (politely).
      </div>

      {/* Your Lists row */}
      {myLists.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 16 }}>Your Lists</div>
            <Link href="/lists" style={{ color: "#2563eb", fontSize: 13 }}>
              View all →
            </Link>
          </div>

          <div className="row">
            {myLists.slice(0, 10).map((l: any) => (
              <Link
                key={l.id}
                href={`/lists/${l.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="listCard">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>
                      {(l.title ?? l.name) || "Untitled list"}
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>
                      {l.item_count ?? 0} games
                    </div>
                  </div>

                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                    {l.description || "—"}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <button
                      className="shimmerBtn"
                      onClick={(e) => {
                        e.preventDefault();
                        window.location.href = `/lists/${l.id}`;
                      }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Curated Lists row */}
      {curatedLists.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 16 }}>Curated</div>
            <Link href="/lists" style={{ color: "#2563eb", fontSize: 13 }}>
              View all →
            </Link>
          </div>

          <div className="row">
            {curatedLists.slice(0, 10).map((l: any) => (
              <Link
                key={l.id}
                href={`/lists/${l.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="listCard">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>
                      {(l.title ?? l.name) || "Curated list"}
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>
                      ⭐ Curated
                    </div>
                  </div>

                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                    {l.description || "—"}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <button
                      className="shimmerBtn"
                      onClick={(e) => {
                        e.preventDefault();
                        window.location.href = `/lists/${l.id}`;
                      }}
                    >
                      Open
                    </button>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.length === 0 ? (
        <div style={{ color: "#6b7280" }}>
          No sections yet — add games or sync Steam/RetroAchievements.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 22 }}>
          {sections.map((section) => (
            <div key={section.key}>
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>
                {section.title}
              </div>

              <div className="row">
                {section.items.map((item: Item) => {
                  const rel = item.releases;
                  const title = rel?.display_title ?? "Unknown";

                  const platform = rel?.platform_name ?? "—";

                  const year = rel?.games?.first_release_year ?? null;
                  const dev = rel?.games?.developer ?? null;
                  const genres = Array.isArray(rel?.games?.genres) ? rel!.games!.genres! : [];

                  return (
                    <Link
                      key={item.entry_id ?? item.release_id}
                      href={rel?.id ? `/releases/${rel.id}` : "#"}
                      style={{ textDecoration: "none", color: "inherit" }}
                      onClick={(e) => {
                        if (!rel?.id) e.preventDefault();
                      }}
                    >
                      <div className="card">
                        {/* Cover (optional) */}
                        <div
                          style={{
                            width: "100%",
                            height: 110,
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                            background: "#f8fafc",
                            overflow: "hidden",
                            marginBottom: 10,
                          }}
                        >
                          {rel?.cover_url ? (
                            <img
                              src={rel.cover_url}
                              alt={rel.display_title ?? "cover"}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                          ) : null}
                        </div>

                        <div style={{ fontWeight: 800, marginBottom: 8 }}>
                          {rel?.display_title ?? "Unknown"}
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span className="pill">{platform}</span>
                          <span className="pill">{item.status.replace("_", " ")}</span>
                        </div>

                        {/* Metadata line */}
                        {(year || dev || genres.length > 0) && (
                          <div
                            style={{
                              marginTop: 8,
                              color: "#64748b",
                              fontSize: 12,
                              display: "flex",
                              gap: 8,
                              flexWrap: "wrap",
                              alignItems: "center",
                            }}
                          >
                            {year ? <span>{year}</span> : null}
                            {dev ? <span>• {dev}</span> : null}

                            {genres.length > 0 ? (
                              <span style={{ display: "inline-flex", gap: 6 }}>
                                {genres.slice(0, 2).map((g: string) => (
                                  <span
                                    key={g}
                                    style={{
                                      fontSize: 12,
                                      padding: "2px 8px",
                                      borderRadius: 999,
                                      border: "1px solid #e5e7eb",
                                      background: "white",
                                      color: "#0f172a",
                                      lineHeight: 1.2,
                                    }}
                                  >
                                    {g}
                                  </span>
                                ))}
                              </span>
                            ) : null}
                          </div>
                        )}

                        <div style={{ marginTop: 10, color: "#64748b", fontSize: 12 }}>
                          {item.last_played_at
                            ? `Last played: ${new Date(item.last_played_at).toLocaleDateString()}`
                            : "Last played: —"}
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <button
                            className="shimmerBtn"
                            onClick={(e) => {
                              e.preventDefault();
                              if (rel?.id) window.location.href = `/releases/${rel.id}`;
                            }}
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
