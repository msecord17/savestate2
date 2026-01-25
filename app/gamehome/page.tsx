"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Card = {
  // game mode
  game_id?: string;
  platforms?: string[];

  // release mode
  release_id?: string;
  platform_key?: string | null;
  platform_name?: string | null;
  platform_label?: string | null;

  title: string;
  cover_url: string | null;
  status: string;

  steam_playtime_minutes: number;

  psn_playtime_minutes: number | null;
  psn_trophy_progress: number | null;
  psn_trophies_earned: number | null;
  psn_trophies_total: number | null;

  xbox_achievements_earned: number | null;
  xbox_achievements_total: number | null;
  xbox_gamerscore_earned: number | null;
  xbox_gamerscore_total: number | null;

  sources: string[];
  lastSignalAt: string | null;
};

function minutesToHours(min: number) {
  const h = Math.round((min / 60) * 10) / 10;
  if (!isFinite(h) || h <= 0) return "0h";
  return `${h}h`;
}

function timeAgo(iso: string | null) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!t) return null;
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function pillStyle(bg: string) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: bg,
    fontSize: 12,
    fontWeight: 900 as const,
    color: "#0f172a",
    whiteSpace: "nowrap" as const,
  };
}

function normalizeSourceKey(s: string) {
  const x = String(s || "").toLowerCase();
  if (x === "steam") return "steam";
  if (x === "psn" || x === "playstation") return "psn";
  if (x === "xbox") return "xbox";
  return x;
}

function cardPlatformLabel(c: any) {
  return (
    (c.platform_label && String(c.platform_label)) ||
    (c.platform_name && String(c.platform_name)) ||
    (c.platform_key && String(c.platform_key)) ||
    "Unknown"
  );
}

export default function GameHomePage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [cards, setCards] = useState<Card[]>([]);

  // filters
  const [platform, setPlatform] = useState<string>("all");
  const [source, setSource] = useState<string>("all"); // all|Steam|PSN|Xbox
  const [status, setStatus] = useState<string>("all");
  const [updatedRecently, setUpdatedRecently] = useState<boolean>(false);
  const [sort, setSort] = useState<"recent" | "title">("recent");
  const [splitByPlatform, setSplitByPlatform] = useState<boolean>(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const mode = splitByPlatform ? "release" : "game";
      const res = await fetch(`/api/gamehome?mode=${mode}`, { cache: "no-store" });
      const text = await res.text();
      if (text.trim().startsWith("<")) throw new Error("Server returned HTML (auth redirect?)");
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      const arr = Array.isArray(data?.cards) ? data.cards : [];
      setCards(arr);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [splitByPlatform]);

  const platforms = useMemo(() => {
    const set = new Set<string>();

    for (const c of cards as any[]) {
      if (Array.isArray(c.platforms)) {
        c.platforms.forEach((p) => set.add(p));
      } else {
        // release mode cards
        const label = c.platform_label || c.platform_name || c.platform_key;
        if (label) set.add(String(label));
      }
    }

    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [cards]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    for (const c of cards) set.add(String(c.status || "owned"));
    return ["all", ...Array.from(set).sort()];
  }, [cards]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const recentWindowMs = 1000 * 60 * 60 * 24 * 3; // 3 days

    let out = cards.slice();

    if (platform !== "all") {
      if (splitByPlatform) {
        out = out.filter((c: any) => {
          const label = c.platform_label || c.platform_name || c.platform_key || "";
          return String(label) === platform;
        });
      } else {
        out = out.filter((c) => Array.isArray(c.platforms) && c.platforms.includes(platform));
      }
    }

    if (source !== "all") {
      // In release-mode (splitByPlatform), "Source" should mean the release's platform_key.
      // In game-mode, keep current behavior: "this game has signals from X".
      if (splitByPlatform) {
        const want = normalizeSourceKey(source);
        out = out.filter((c: any) => normalizeSourceKey(c.platform_key) === want);
      } else {
        out = out.filter((c) => Array.isArray(c.sources) && c.sources.includes(source));
      }
    }

    if (status !== "all") {
      out = out.filter((c) => String(c.status || "owned") === status);
    }

    if (updatedRecently) {
      out = out.filter((c) => {
        if (!c.lastSignalAt) return false;
        const t = new Date(c.lastSignalAt).getTime();
        return isFinite(t) && now - t <= recentWindowMs;
      });
    }

    if (sort === "recent") {
      out.sort((a, b) => {
        const ta = a.lastSignalAt ? new Date(a.lastSignalAt).getTime() : 0;
        const tb = b.lastSignalAt ? new Date(b.lastSignalAt).getTime() : 0;
        return tb - ta;
      });
    } else {
      out.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    }

    return out;
  }, [cards, platform, source, status, updatedRecently, sort]);

  return (
    <div style={{ padding: 20, maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 10 }}>Game Home</h1>
        <p style={{ color: "#64748b", marginBottom: 20 }}>
          Your cross-platform game library at a glance.
        </p>

        {err ? (
          <div
            style={{
              padding: 12,
              background: "#fee",
              border: "1px solid #fcc",
              borderRadius: 8,
              color: "#c00",
            }}
          >
            {err}
          </div>
        ) : null}

        {loading ? (
          <div style={{ padding: 20, textAlign: "center", color: "#64748b" }}>Loading...</div>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: 20,
              }}
            >
              <label style={{ fontWeight: 900, color: "#0f172a" }}>
                Platform:
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  style={{ marginLeft: 8, padding: "4px 8px", borderRadius: 6 }}
                >
                  {platforms.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontWeight: 900, color: "#0f172a" }}>
                Source:
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  style={{ marginLeft: 8, padding: "4px 8px", borderRadius: 6 }}
                >
                  <option value="all">all</option>
                  <option value="Steam">Steam</option>
                  <option value="PSN">PSN</option>
                  <option value="Xbox">Xbox</option>
                </select>
              </label>

              <label style={{ fontWeight: 900, color: "#0f172a" }}>
                Status:
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  style={{ marginLeft: 8, padding: "4px 8px", borderRadius: 6 }}
                >
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ fontWeight: 900, color: "#0f172a" }}>
                Sort:
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  style={{ marginLeft: 8, padding: "4px 8px", borderRadius: 6 }}
                >
                  <option value="recent">Recent</option>
                  <option value="title">Title</option>
                </select>
              </label>

              <label
                style={{
                  display: "inline-flex",
                  gap: 8,
                  alignItems: "center",
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                <input
                  type="checkbox"
                  checked={updatedRecently}
                  onChange={(e) => setUpdatedRecently(e.target.checked)}
                />
                Recently updated (3d)
              </label>

              <label
                style={{
                  display: "inline-flex",
                  gap: 8,
                  alignItems: "center",
                  fontWeight: 900,
                  color: "#0f172a",
                }}
              >
                <input
                  type="checkbox"
                  checked={splitByPlatform}
                  onChange={(e) => setSplitByPlatform(e.target.checked)}
                />
                Split by platform
              </label>

              <div style={{ color: "#64748b", fontSize: 13 }}>
                Showing <b>{filtered.length}</b> / {cards.length}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 14,
              }}
            >
              {filtered.map((c, idx) => {
                const updated = timeAgo(c.lastSignalAt);

                const hasSteam = Number(c.steam_playtime_minutes || 0) > 0;

                const hasPsn =
                  c.psn_playtime_minutes != null ||
                  c.psn_trophy_progress != null ||
                  (c as any).psn_last_updated_at != null;

                const hasXbox =
                  c.xbox_gamerscore_total != null ||
                  c.xbox_achievements_total != null ||
                  (c as any).xbox_last_updated_at != null;

                const showPsnTrophies = c.psn_trophy_progress != null;
                const showXboxGS = (c.xbox_gamerscore_total ?? 0) > 0;

                // Ensure unique key in both modes
                const uniqueKey = splitByPlatform
                  ? (c.release_id ?? `${c.title}-${idx}`)
                  : (c.game_id ?? c.release_id ?? `${c.title}-${idx}`);

                return (
                  <div
                    key={uniqueKey}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    {c.release_id ? (
                      <Link
                        href={`/releases/${c.release_id}`}
                        style={{
                          display: "block",
                          height: 140,
                          background: c.cover_url
                            ? `center / cover no-repeat url(${c.cover_url})`
                            : "linear-gradient(135deg, #0f172a, #334155)",
                          cursor: "pointer",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          height: 140,
                          background: c.cover_url
                            ? `center / cover no-repeat url(${c.cover_url})`
                            : "linear-gradient(135deg, #0f172a, #334155)",
                        }}
                      />
                    )}

                    <div style={{ padding: 12 }}>
                      {/* Title */}
                      <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.25 }}>
                        {c.title}
                      </div>

                      {/* Platform(s) */}
                      <div
                        style={{
                          display: "flex",
                          gap: 6,
                          flexWrap: "wrap",
                          marginTop: 4,
                          marginBottom: 10,
                        }}
                      >
                        {(Array.isArray((c as any).platforms)
                          ? (c as any).platforms
                          : [c.platform_label || c.platform_name || c.platform_key]
                        )
                          .filter(Boolean)
                          .map((p: string) => (
                            <span
                              key={p}
                              style={{
                                fontSize: 11,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: "#f1f5f9",
                                border: "1px solid #e5e7eb",
                                fontWeight: 700,
                                color: "#0f172a",
                              }}
                            >
                              {p}
                            </span>
                          ))}
                      </div>

                      {c.lastSignalAt && (
                        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}>
                          Last activity: <b>{timeAgo(c.lastSignalAt)}</b>
                        </div>
                      )}

                      {/* indicator pills */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
                        {/* Status (primary) */}
                        <span
                          style={{
                            ...pillStyle(
                              c.status === "completed"
                                ? "#ecfeff"
                                : c.status === "playing"
                                ? "#eef2ff"
                                : c.status === "wishlist"
                                ? "#f8fafc"
                                : "#fff7ed"
                            ),
                            fontWeight: 900,
                          }}
                        >
                          {c.status || "owned"}
                        </span>

                        {/* Sync signals */}
                        <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#64748b" }}>
                          {hasSteam && <span>Steam</span>}
                          {hasPsn && <span>PSN</span>}
                          {hasXbox && <span>Xbox</span>}
                          {!hasSteam && !hasPsn && !hasXbox && (
                            <span style={{ color: "#b45309" }}>No sync signal</span>
                          )}
                        </div>
                      </div>

                      {/* details block */}
                      {(() => {
                        const steamMin = Number(c.steam_playtime_minutes || 0);
                        const psnMin = c.psn_playtime_minutes != null ? Number(c.psn_playtime_minutes) : 0;
                        const xboxGsTotal = Number(c.xbox_gamerscore_total || 0);
                        const xboxAchTotal = Number(c.xbox_achievements_total || 0);

                        return (
                          <div
                            style={{
                              display: "flex",
                              gap: 12,
                              flexWrap: "wrap",
                              marginTop: 8,
                              fontSize: 13,
                              color: "#0f172a",
                            }}
                          >
                            {steamMin > 0 && (
                              <span title="Steam playtime">🎮 {minutesToHours(steamMin)}</span>
                            )}

                            {psnMin > 0 && (
                              <span title="PlayStation playtime">🕹️ {minutesToHours(psnMin)}</span>
                            )}

                            {c.psn_trophy_progress != null && (
                              <span title="PlayStation trophy progress">🏆 {Math.round(Number(c.psn_trophy_progress))}%</span>
                            )}

                            {xboxGsTotal > 0 && (
                              <span title="Xbox gamerscore">
                                ✖︎ {Number(c.xbox_gamerscore_earned ?? 0)}/{xboxGsTotal}
                              </span>
                            )}

                            {xboxAchTotal > 0 && (
                              <span title="Xbox achievements">
                                🏅 {Number(c.xbox_achievements_earned ?? 0)}/{xboxAchTotal}
                              </span>
                            )}

                            {/* If literally nothing exists, show a placeholder */}
                            {steamMin <= 0 &&
                              psnMin <= 0 &&
                              c.psn_trophy_progress == null &&
                              xboxGsTotal <= 0 &&
                              xboxAchTotal <= 0 && (
                                <span style={{ color: "#64748b" }}>No activity data yet</span>
                              )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
