"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type GameMeta = {
  igdb_game_id?: number | null;
  summary?: string | null;
  genres?: string[] | null;
  developer?: string | null;
  publisher?: string | null;
  first_release_year?: number | null;
} | null;

type Release = {
  id: string;
  display_title: string;
  platform_name: string;
  platform_key: string | null;
  cover_url?: string | null;
  games?: GameMeta;
} | null;

type Item = {
  entry_id: string;
  release_id: string;
  status: string;
  playtime_minutes: number;
  last_played_at: string | null;
  updated_at: string;
  releases: Release;
};

type Section = {
  key: string;
  title: string;
  items: Item[];
};

type ListRow = {
  id: string;
  title?: string | null;
  name?: string | null;
  description?: string | null;
  item_count?: number | null;
  is_smart?: boolean | null;
  is_curated?: boolean | null;
};

export default function GameHomePage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [curatedLists, setCuratedLists] = useState<ListRow[]>([]);
  const [myLists, setMyLists] = useState<ListRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Gamer Score
  const [score, setScore] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [globalPct, setGlobalPct] = useState<number | null>(null);

  const [showScoreInfo, setShowScoreInfo] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function safeJson(res: Response) {
      const text = await res.text();
      try {
        return text ? JSON.parse(text) : null;
      } catch {
        return { __raw: text };
      }
    }

    async function loadAll() {
      try {
        setLoading(true);
        setErr("");

        // 1) GameHome sections
        const ghRes = await fetch("/api/gamehome", { cache: "no-store" });
        const ghData = await safeJson(ghRes);
        if (!ghRes.ok) throw new Error(ghData?.error || `GameHome failed (${ghRes.status})`);
        if (!cancelled) setSections(Array.isArray(ghData?.sections) ? ghData.sections : []);

        // 2) Curated lists
        const cRes = await fetch("/api/lists/curated", { cache: "no-store" });
        const cData = await safeJson(cRes);
        if (!cancelled) setCuratedLists(Array.isArray(cData) ? cData : []);

        // 3) Your lists
        const mRes = await fetch("/api/lists/mine", { cache: "no-store" });
        const mData = await safeJson(mRes);
        if (!cancelled) setMyLists(Array.isArray(mData) ? mData : []);

        // 4) Gamer score from profile (same as Profile page)
        try {
          const pRes = await fetch("/api/profile/me", { cache: "no-store" });
          const pData = await safeJson(pRes);
          if (pRes.ok && pData?.profile) {
            const profile = pData.profile;
            if (!cancelled) {
              setScore(
                typeof profile.gamer_score_v11 === "number"
                  ? profile.gamer_score_v11
                  : null
              );
              setConfidence(
                typeof profile.gamer_score_v11_confidence === "number"
                  ? profile.gamer_score_v11_confidence
                  : null
              );
            }
          } else {
            if (!cancelled) {
              setScore(null);
              setConfidence(null);
            }
          }
        } catch {
          if (!cancelled) {
            setScore(null);
            setConfidence(null);
          }
        }

        // 5) Global standing percentile (same as Profile page)
        try {
          const gRes = await fetch("/api/leaderboard/mock?user_id=me", { cache: "no-store" });
          const text = await gRes.text();
          const gData = text ? JSON.parse(text) : null;

          if (gRes.ok && gData?.me?.global_top_percent != null) {
            if (!cancelled) setGlobalPct(gData.me.global_top_percent);
          } else {
            if (!cancelled) setGlobalPct(null);
          }
        } catch {
          if (!cancelled) setGlobalPct(null);
        }
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


  if (loading) return <div style={{ padding: 24, color: "#6b7280" }}>Loading…</div>;

  if (err) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</div>
        <div style={{ color: "#64748b" }}>
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

        .gameCard {
          min-width: 240px;
          max-width: 240px;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 12px;
          background: white;
          scroll-snap-align: start;
          transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
          display: flex;
          gap: 10px;
        }
        .gameCard:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(0,0,0,0.08);
          border-color: #cbd5e1;
        }

        .cover {
          width: 66px;
          height: 88px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          overflow: hidden;
          flex-shrink: 0;
        }
        .coverImg { width: 100%; height: 100%; object-fit: cover; display: block; }

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

        .shimmerBtn {
          position: relative;
          border-radius: 10px;
          border: 1px solid #e5e7eb;
          padding: 8px 10px;
          background: white;
          cursor: pointer;
          overflow: hidden;
        }
        .shimmerBtn::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          padding: 1.5px;
          background: linear-gradient(
            135deg,
            rgba(203, 213, 225, 0.9),
            rgba(167, 139, 250, 0.85),
            rgba(203, 213, 225, 0.9)
          );
          -webkit-mask:
            linear-gradient(#000 0 0) content-box,
            linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          opacity: 0;
          transition: opacity 140ms ease;
          pointer-events: none;
        }
        .shimmerBtn:hover::after { opacity: 1; }

        .scoreStrip {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 14px;
          background: white;
          margin-bottom: 16px;
        }
        .scoreTop {
          display: flex;
          gap: 14px;
          align-items: baseline;
          justify-content: space-between;
          flex-wrap: wrap;
        }
        .scoreTitle {
          font-weight: 900;
          font-size: 16px;
          color: #0f172a;
          display: flex;
          gap: 10px;
          align-items: baseline;
          flex-wrap: wrap;
        }
        .scoreMeta { font-size: 12px; color: #64748b; }
        .scoreValue {
          font-size: 28px;
          font-weight: 900;
          color: #0f172a;
        }
        .scoreGlobal {
          margin-top: 6px;
          color: #64748b;
          font-size: 12px;
        }
        .scoreInfoBtn {
          border: none;
          background: transparent;
          color: #2563eb;
          cursor: pointer;
          padding: 0;
          font-size: 12px;
          text-decoration: underline;
        }
        .scoreInfoBox {
          margin-top: 10px;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          color: #334155;
          line-height: 1.55;
        }
        .ctaRow {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          margin-top: 10px;
        }
        .ctaLink {
          color: #2563eb;
          font-weight: 700;
          font-size: 13px;
          text-decoration: none;
        }

        .listCard {
          min-width: 260px;
          max-width: 260px;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
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
        .badge {
          font-size: 12px;
          padding: 3px 8px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background: white;
          color: #0f172a;
          line-height: 1.2;
          white-space: nowrap;
        }
      `}</style>

      {/* Gamer Score strip */}
      <div className="scoreStrip">
        <div className="scoreTop">
          <div className="scoreTitle">
            <span>Gamer Score</span>
            {typeof confidence === "number" ? (
              <span className="scoreMeta">Confidence {confidence}%</span>
            ) : null}
          </div>

          <button
            className="scoreInfoBtn"
            onClick={() => setShowScoreInfo((v) => !v)}
            type="button"
          >
            What’s this score?
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div className="scoreValue">
            {score != null ? score.toLocaleString() : "—"}
          </div>
          {typeof globalPct === "number" && (
            <div className="scoreGlobal">
              Top <strong>{globalPct}%</strong> globally
            </div>
          )}
        </div>

        {showScoreInfo && (
          <div className="scoreInfoBox">
            <p style={{ margin: 0 }}>
              <strong>Gamer Score</strong> is your “lifetime resume” of gaming: playtime, achievements, and
              completion signals blended into one number — designed to be fun, shareable, and grounded in data.
            </p>
            <p style={{ margin: "10px 0 0 0" }}>
              Level it up by connecting <strong>Steam</strong> (playtime), <strong>RetroAchievements</strong> (verified mastery),
              and taking the <strong>Era Quiz</strong> to capture older history we can’t auto-sync.
            </p>

            <div className="ctaRow">
              <Link className="ctaLink" href="/profile">
                Connect Steam / RetroAchievements →
              </Link>
              <Link className="ctaLink" href="/era-quiz">
                Take the Era Quiz →
              </Link>
              <Link className="ctaLink" href="/leaderboard">
                See Leaderboard →
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Header */}
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
            {myLists.slice(0, 10).map((l) => (
              <Link
                key={l.id}
                href={`/lists/${l.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="listCard">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>
                      {l.title ?? l.name ?? "Untitled list"}
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>
                      {l.item_count ?? 0} games
                    </div>
                  </div>

                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                    {l.description || "—"}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {l.is_smart ? (
                      <span className="badge" title="This list is computed from rules">
                        ⚡ Smart
                      </span>
                    ) : null}
                    {l.is_curated ? (
                      <span className="badge" title="Curated list">
                        ⭐ Curated
                      </span>
                    ) : null}
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
            <div style={{ fontWeight: 800, fontSize: 16 }}>Curated Lists</div>
            <Link href="/lists" style={{ color: "#2563eb", fontSize: 13 }}>
              View all →
            </Link>
          </div>

          <div className="row">
            {curatedLists.slice(0, 10).map((l) => (
              <Link
                key={l.id}
                href={`/lists/${l.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="listCard">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>
                      {l.title ?? l.name ?? "Untitled list"}
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>
                      {l.item_count ?? 0} games
                    </div>
                  </div>

                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
                    {l.description || "—"}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {l.is_smart ? (
                      <span className="badge" title="This list is computed from rules">
                        ⚡ Smart
                      </span>
                    ) : null}
                    {l.is_curated ? (
                      <span className="badge" title="Curated list">
                        ⭐ Curated
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.length === 0 && (
        <div style={{ color: "#6b7280" }}>
          No sections yet — add games or sync Steam/RetroAchievements.
        </div>
      )}

      <div style={{ display: "grid", gap: 22 }}>
        {sections.map((section) => (
          <div key={section.key}>
            <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 10 }}>
              {section.title}
            </div>

            <div className="row">
              {section.items.map((item) => {
                const rel = item.releases;
                const title = rel?.display_title ?? "Unknown";
                const platform = rel?.platform_name ?? "—";
                const cover = rel?.cover_url ?? null;

                // Optional: metadata line (safe)
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
                    <div className="gameCard">
                      {/* Cover */}
                      <div className="cover">
                        {cover ? (
                          <img className="coverImg" src={cover} alt={title} />
                        ) : null}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 900, marginBottom: 6, lineHeight: 1.2 }}>
                          {title}
                        </div>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span className="pill">{platform}</span>
                          <span className="pill">{String(item.status).replace("_", " ")}</span>
                        </div>

                        {(year || dev || genres.length > 0) && (
                          <div
                            style={{
                              marginTop: 7,
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

                        <div style={{ marginTop: 8 }}>
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
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
