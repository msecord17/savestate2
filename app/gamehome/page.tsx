"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Card = {
  // game mode
  game_id?: string;
  platforms?: string[];

  // release mode
  release_id?: string;

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
    for (const c of cards) {
      if (Array.isArray(c.platforms)) {
        c.platforms.forEach((p) => set.add(p));
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
      out = out.filter((c) =>
        Array.isArray(c.platforms) ? c.platforms.includes(platform) : false
      );
    }

    if (source !== "all") {
      out = out.filter((c) => c.sources?.includes(source));
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
              {filtered.map((c) => {
                const updated = timeAgo(c.lastSignalAt);

                const hasSteam = c.steam_playtime_minutes > 0;
                const hasPsn = c.psn_playtime_minutes != null && c.psn_playtime_minutes > 0;
                const hasXbox = (c.xbox_gamerscore_total ?? 0) > 0 || (c.xbox_achievements_total ?? 0) > 0;

                const showPsnTrophies = c.psn_trophy_progress != null;
                const showXboxGS = (c.xbox_gamerscore_total ?? 0) > 0;

                return (
                  <div
                    key={(c.game_id ?? c.release_id ?? c.title) as string}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      overflow: "hidden",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        height: 140,
                        background: c.cover_url
                          ? `center / cover no-repeat url(${c.cover_url})`
                          : "linear-gradient(135deg, #0f172a, #334155)",
                      }}
                    />

                    <div style={{ padding: 12 }}>
                      <div style={{ fontWeight: 900, lineHeight: 1.2, marginBottom: 6 }}>
                        {c.title}
                      </div>

                      <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>
                        {Array.isArray(c.platforms) && c.platforms.length
                          ? `Platforms: ${c.platforms.join(" • ")}`
                          : "Platforms: —"}
                        {updated ? (
                          <>
                            {" "}
                            • <span style={{ fontWeight: 900, color: "#0f172a" }}>Updated</span>{" "}
                            {updated}
                          </>
                        ) : null}
                      </div>

                      {/* indicator pills */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                        <span style={pillStyle("#f8fafc")}>Status: {c.status || "owned"}</span>

                        {hasSteam ? <span style={pillStyle("#ecfeff")}>Steam</span> : null}
                        {hasPsn ? <span style={pillStyle("#dbeafe")}>PSN</span> : null}
                        {hasXbox ? <span style={pillStyle("#dcfce7")}>Xbox</span> : null}

                        {!hasSteam && !hasPsn && !hasXbox ? (
                          <span style={pillStyle("#f1f5f9")}>No signals yet</span>
                        ) : null}
                      </div>

                      {/* details block */}
                      <div style={{ display: "grid", gap: 6, fontSize: 13, color: "#0f172a" }}>
                        <div style={{ color: "#64748b" }}>
                          <b>Playtime</b>{" "}
                          <span style={{ color: "#0f172a" }}>
                            {hasSteam ? `Steam ${minutesToHours(c.steam_playtime_minutes)}` : "Steam —"}
                            {" • "}
                            {hasPsn ? `PSN ${minutesToHours(c.psn_playtime_minutes!)}` : "PSN —"}
                          </span>
                        </div>

                        <div style={{ color: "#64748b" }}>
                          <b>Completion signals</b>{" "}
                          <span style={{ color: "#0f172a" }}>
                            {showPsnTrophies
                              ? `PSN trophies ${Math.round(c.psn_trophy_progress!)}%`
                              : "PSN trophies —"}
                            {" • "}
                            {showXboxGS
                              ? `Xbox GS ${c.xbox_gamerscore_earned}/${c.xbox_gamerscore_total}`
                              : "Xbox GS —"}
                          </span>
                        </div>

                        <div style={{ color: "#64748b" }}>
                          <b>Achievements</b>{" "}
                          <span style={{ color: "#0f172a" }}>
                            {c.xbox_achievements_total && c.xbox_achievements_total > 0
                              ? `${c.xbox_achievements_earned}/${c.xbox_achievements_total}`
                              : "—"}
                          </span>
                        </div>
                      </div>
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
