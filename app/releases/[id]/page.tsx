"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type ReleaseDetail = {
  id: string;
  display_title: string | null;
  platform_name: string | null;
  platform_key: string | null;
  platform_label: string | null;
  cover_url: string | null;
  games: {
    id: string;
    canonical_title: string | null;
    igdb_game_id: number | null;
    summary: string | null;
    genres: any | null;
    developer: string | null;
    publisher: string | null;
    first_release_year: number | null;
  } | null;
};

type Signals = {
  psn: null | {
    title_name: string | null;
    title_platform: string | null;
    playtime_minutes: number | null;
    trophy_progress: number | null;
    trophies_earned: number | null;
    trophies_total: number | null;
    last_updated_at: string | null;
  };
  xbox: null | {
    title_name: string | null;
    title_platform: string | null;
    achievements_earned: number | null;
    achievements_total: number | null;
    gamerscore_earned: number | null;
    gamerscore_total: number | null;
    last_updated_at: string | null;
  };
};

type Portfolio = null | {
  status: string | null;
  playtime_minutes: number | null; // you treat as Steam minutes today
  updated_at: string | null;
};

type ApiPayload = {
  release: ReleaseDetail;
  portfolio: Portfolio;
  signals: Signals;
};

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

function pill(bg: string) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: bg,
    fontSize: 13,
    fontWeight: 900 as const,
    color: "#0f172a",
    whiteSpace: "nowrap" as const,
  };
}

function chip() {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid #e5e7eb",
    background: "white",
    fontSize: 12,
    fontWeight: 900 as const,
    color: "#0f172a",
    whiteSpace: "nowrap" as const,
  };
}

function actionBtn(active: boolean) {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: active ? "#0f172a" : "white",
    color: active ? "white" : "#0f172a",
    fontWeight: 900,
    cursor: "pointer",
  } as const;
}

export default function ReleaseDetailPage() {
  const params = useParams<{ id: string }>();
  const releaseId = params?.id;

  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [signals, setSignals] = useState<Signals | null>(null);
  const [portfolio, setPortfolio] = useState<Portfolio>(null);
  const [psnGroups, setPsnGroups] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // Trophy state
  const [trophies, setTrophies] = useState<any[]>([]);
  const [loadingTrophies, setLoadingTrophies] = useState(false);
  const [trophyMsg, setTrophyMsg] = useState("");

  const [trophyOpen, setTrophyOpen] = useState(false);
  const [trophyLoading, setTrophyLoading] = useState(false);
  const [trophyErr, setTrophyErr] = useState("");
  const [trophyData, setTrophyData] = useState<any | null>(null);

  const [achievementOpen, setAchievementOpen] = useState(false);
  const [achievementLoading, setAchievementLoading] = useState(false);
  const [achievementErr, setAchievementErr] = useState("");
  const [achievementData, setAchievementData] = useState<any | null>(null);

  // For actions
  const [myLists, setMyLists] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const title = useMemo(() => {
    return release?.display_title ?? release?.games?.canonical_title ?? "Untitled";
  }, [release]);

  const genresList = useMemo(() => {
    const g: any = release?.games?.genres;
    if (!g) return [];
    if (Array.isArray(g)) return g.filter(Boolean);
    if (typeof g === "string") return [g];
    return [];
  }, [release]);

  function minutesToHours(min: number | null | undefined) {
    const m = Number(min || 0);
    if (!isFinite(m) || m <= 0) return "0h";
    const h = Math.round((m / 60) * 10) / 10;
    return `${h}h`;
  }

  function pct(v: number | null | undefined) {
    const n = Number(v);
    if (!isFinite(n) || n < 0) return null;
    return Math.max(0, Math.min(100, n));
  }

  const platformLine = useMemo(() => {
    const label = (release as any)?.platform_label ?? null;
    const name = release?.platform_name ?? "—";
    if (label && String(label).trim() && String(label).trim() !== name) return `${name} • ${label}`;
    return name;
  }, [release]);

  async function load() {
    if (!releaseId) return;

    try {
      setLoading(true);
      setErr("");

      const res = await fetch(`/api/releases/${releaseId}`, { cache: "no-store" });
      const text = await res.text();
      const data: ApiPayload | null = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error((data as any)?.error || `Failed (${res.status})`);

      const r: ReleaseDetail | null = data?.release ?? null;
      setRelease(r);
      setSignals((data?.signals ?? null) as Signals | null);
      setPortfolio((data?.portfolio ?? null) as Portfolio);
      setPsnGroups(Array.isArray((data as any)?.psnGroups) ? (data as any).psnGroups : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load release");
      setRelease(null);
      setPortfolio(null);
      setSignals(null);
      setPsnGroups([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadTrophies() {
    if (!releaseId) return;

    try {
      setTrophyErr("");
      setTrophyLoading(true);

      const res = await fetch(`/api/releases/${releaseId}/trophies`, { cache: "no-store" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      setTrophyData(data);
    } catch (e: any) {
      setTrophyErr(e?.message || "Failed to load trophies");
      setTrophyData(null);
    } finally {
      setTrophyLoading(false);
    }
  }

  async function loadAchievements() {
    if (!releaseId) return;

    try {
      setAchievementErr("");
      setAchievementLoading(true);

      const res = await fetch(`/api/releases/${releaseId}/achievements`, { cache: "no-store" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      setAchievementData(data);
    } catch (e: any) {
      setAchievementErr(e?.message || "Failed to load achievements");
      setAchievementData(null);
    } finally {
      setAchievementLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [releaseId]);

  useEffect(() => {
    fetch("/api/lists", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setMyLists(Array.isArray(d) ? d : []))
      .catch(() => setMyLists([]));
  }, []);

  async function saveStatus(nextStatus: string) {
    if (!releaseId) return;

    try {
      setSaving(true);
      setMsg("");

      const res = await fetch("/api/portfolio/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_id: releaseId, status: nextStatus }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setMsg("Saved ✅");
      setTimeout(() => setMsg(""), 900);
      await load(); // refresh entry/signals
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addToList(listId: string) {
    if (!releaseId) return;

    try {
      setSaving(true);
      setMsg("");

      const res = await fetch("/api/lists/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_id: listId, release_id: releaseId }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setMsg("Added to list ✅");
      setTimeout(() => setMsg(""), 900);
    } catch (e: any) {
      setMsg(e?.message || "Add failed");
    } finally {
      setSaving(false);
    }
  }

  // Backloggd-ish “quick actions”
  const currentStatus = String(portfolio?.status ?? "owned");

  // Compute playtime correctly - Steam only for Steam releases
  const isSteamRelease = (release?.platform_key || "").toLowerCase() === "steam";
  const steamMinutes = isSteamRelease ? Number((portfolio as any)?.playtime_minutes ?? 0) : 0;
  const psnMinutes = Number((signals as any)?.psn?.playtime_minutes ?? 0);
  const psnProgress = (signals as any)?.psn?.trophy_progress ?? null;

  const hasSteam = steamMinutes > 0;
  const hasPsn = !!signals?.psn;
  const hasXbox = !!signals?.xbox;

  const lastSignal = useMemo(() => {
    const a = portfolio?.updated_at ?? null;
    const b = signals?.psn?.last_updated_at ?? null;
    const c = signals?.xbox?.last_updated_at ?? null;
    const times = [a, b, c]
      .filter(Boolean)
      .map((x) => new Date(String(x)).getTime())
      .filter((t) => isFinite(t));
    if (!times.length) return null;
    const max = Math.max(...times);
    return timeAgo(new Date(max).toISOString());
  }, [signals]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14, display: "flex", justifyContent: "space-between", gap: 12 }}>
        <Link href="/my-portfolio" style={{ color: "#2563eb" }}>
          ← Back to My Portfolio
        </Link>
        <Link href="/gamehome" style={{ color: "#2563eb" }}>
          GameHome →
        </Link>
      </div>

      {loading && <div style={{ color: "#6b7280" }}>Loading…</div>}
      {err && <div style={{ color: "#b91c1c" }}>{err}</div>}

      {!loading && release && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
          {/* Left rail (Backloggd-ish controls) */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              background: "white",
              padding: 14,
              height: "fit-content",
              position: "sticky",
              top: 16,
            }}
          >
            {/* cover */}
            <div
              style={{
                width: "100%",
                height: 360,
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                background: release.cover_url
                  ? `center / cover no-repeat url(${release.cover_url})`
                  : "linear-gradient(135deg, #0f172a, #334155)",
                marginBottom: 12,
              }}
              aria-label="Cover"
            />

            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("played")}
                  style={actionBtn(currentStatus === "played")}
                >
                  Played
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("playing")}
                  style={actionBtn(currentStatus === "playing")}
                >
                  Playing
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("backlog")}
                  style={actionBtn(currentStatus === "backlog")}
                >
                  Backlog
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("wishlist")}
                  style={actionBtn(currentStatus === "wishlist")}
                >
                  Wishlist
                </button>
              </div>

              {/* Secondary statuses (optional but useful) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("owned")}
                  style={actionBtn(currentStatus === "owned")}
                >
                  Owned
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => saveStatus("dropped")}
                  style={actionBtn(currentStatus === "dropped")}
                >
                  Dropped
                </button>
              </div>

              {/* Add to list */}
              {myLists.length > 0 && (
                <select
                  defaultValue=""
                  disabled={saving}
                  onChange={(e) => {
                    const listId = e.target.value;
                    if (!listId) return;
                    addToList(listId);
                    e.currentTarget.value = "";
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    fontWeight: 900,
                  }}
                >
                  <option value="">Add to list…</option>
                  {myLists.map((l: any) => (
                    <option key={l.id} value={l.id}>
                      {(l.title ?? l.name) || "Untitled list"}
                    </option>
                  ))}
                </select>
              )}

              {msg ? <div style={{ color: "#64748b", fontSize: 13 }}>{msg}</div> : null}

              {/* Signals */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Signals</div>

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 12,
                    background: "#f8fafc",
                  }}
                >
                  {/* Steam (portfolio playtime) - only for Steam releases */}
                  {isSteamRelease && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div style={{ fontWeight: 900 }}>Steam</div>
                      <div style={{ color: "#0f172a" }}>
                        {steamMinutes > 0 ? (
                          <span>🎮 {minutesToHours(steamMinutes)}</span>
                        ) : (
                          <span style={{ color: "#64748b" }}>—</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* PSN trophies */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>PlayStation</div>
                    <div style={{ color: "#0f172a", textAlign: "right" }}>
                      {signals?.psn ? (
                        <>
                          <div>
                            {signals.psn.trophy_progress != null ? (
                              <span>🏆 {Math.round(Number(signals.psn.trophy_progress))}%</span>
                            ) : (
                              <span style={{ color: "#64748b" }}>🏆 —</span>
                            )}
                            {"  "}
                            {signals.psn.trophies_total ? (
                              <span style={{ color: "#64748b" }}>
                                ({signals.psn.trophies_earned ?? 0}/{signals.psn.trophies_total})
                              </span>
                            ) : null}
                          </div>
                          <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                            🕹️ {minutesToHours(signals.psn.playtime_minutes)}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#64748b" }}>—</span>
                      )}
                    </div>
                  </div>

                  {/* PSN progress bar */}
                  {signals?.psn && pct(signals.psn.trophy_progress) != null ? (
                    <div>
                      <div
                        style={{
                          height: 10,
                          borderRadius: 999,
                          background: "#e5e7eb",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: 10,
                            width: `${pct(signals.psn.trophy_progress)}%`,
                            background: "#0f172a",
                          }}
                        />
                      </div>
                    </div>
                  ) : null}

                  {/* Xbox */}
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>Xbox</div>
                    <div style={{ color: "#0f172a", textAlign: "right" }}>
                      {signals?.xbox ? (
                        <>
                          <div>
                            {signals.xbox.gamerscore_total ? (
                              <span>
                                ✖︎ {signals.xbox.gamerscore_earned ?? 0}/{signals.xbox.gamerscore_total}
                              </span>
                            ) : (
                              <span style={{ color: "#64748b" }}>✖︎ —</span>
                            )}
                          </div>
                          <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>
                            {signals.xbox.achievements_total ? (
                              <span>
                                🏅 {signals.xbox.achievements_earned ?? 0}/{signals.xbox.achievements_total}
                              </span>
                            ) : (
                              <span>🏅 —</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: "#64748b" }}>—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Trophies (lazy) */}
              <div style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ fontWeight: 900 }}>Trophies</div>

                  <button
                    onClick={async () => {
                      const next = !trophyOpen;
                      setTrophyOpen(next);
                      if (next && !trophyData && !trophyLoading) {
                        await loadTrophies();
                      }
                    }}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    {trophyOpen ? "Hide" : "View"}
                  </button>
                </div>

                {trophyOpen && (
                  <div
                    style={{
                      marginTop: 10,
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      background: "white",
                      overflow: "hidden",
                    }}
                  >
                    {trophyLoading && <div style={{ padding: 12, color: "#64748b" }}>Loading trophies…</div>}
                    {trophyErr && <div style={{ padding: 12, color: "#b91c1c" }}>{trophyErr}</div>}

                    {!trophyLoading && !trophyErr && trophyData && (
                      <div style={{ padding: 12 }}>
                        <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>
                          {trophyData.cached ? "Cached" : "Fresh"} • fetched{" "}
                          {trophyData.fetched_at ? new Date(trophyData.fetched_at).toLocaleString() : ""}
                        </div>

                        {/* Merge earned -> show earned state next to each trophy */}
                        <TrophyList trophies={trophyData.trophies} earned={trophyData.earned} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Achievements (lazy) - show for any release with Xbox signal data */}
              {signals?.xbox && (signals.xbox.achievements_total != null || signals.xbox.gamerscore_total != null) && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ fontWeight: 900 }}>Achievements</div>

                    <button
                      onClick={async () => {
                        const next = !achievementOpen;
                        setAchievementOpen(next);
                        if (next && !achievementData && !achievementLoading) {
                          await loadAchievements();
                        }
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "white",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {achievementOpen ? "Hide" : "View"}
                    </button>
                  </div>

                  {achievementOpen && (
                    <div
                      style={{
                        marginTop: 10,
                        border: "1px solid #e5e7eb",
                        borderRadius: 14,
                        background: "white",
                        overflow: "hidden",
                      }}
                    >
                      {achievementLoading && <div style={{ padding: 12, color: "#64748b" }}>Loading achievements…</div>}
                      {achievementErr && <div style={{ padding: 12, color: "#b91c1c" }}>{achievementErr}</div>}

                      {!achievementLoading && !achievementErr && achievementData && (
                        <div style={{ padding: 12 }}>
                          <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>
                            {achievementData.cached ? "Cached" : "Fresh"} • fetched{" "}
                            {achievementData.fetched_at ? new Date(achievementData.fetched_at).toLocaleString() : ""}
                            {achievementData.title_id && (
                              <> • Title ID: {achievementData.title_id}</>
                            )}
                          </div>

                          {achievementData.achievements && Array.isArray(achievementData.achievements) && achievementData.achievements.length > 0 ? (
                            <AchievementList achievements={achievementData.achievements} earned={achievementData.earned || []} />
                          ) : (
                            <div style={{ color: "#64748b", padding: 12 }}>
                              No achievements found. This might mean the game has no achievements, or they haven't been loaded yet.
                            </div>
                          )}
                        </div>
                      )}
                      
                      {!achievementLoading && !achievementErr && !achievementData && (
                        <div style={{ padding: 12, color: "#64748b" }}>
                          Click "View" to load achievements.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Main panel (Minimap-ish metadata + content) */}
          <div style={{ display: "grid", gap: 16 }}>
            {/* Header */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                background: "white",
                padding: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 30, fontWeight: 1000, lineHeight: 1.1 }}>{title}</div>

                  <div style={{ color: "#64748b", marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span style={chip()}>{platformLine}</span>
                    {release.games?.first_release_year ? <span style={chip()}>{release.games.first_release_year}</span> : null}
                    {release.games?.igdb_game_id ? <span style={chip()} title="Metadata enriched from IGDB">IGDB</span> : null}
                    {lastSignal ? <span style={chip()}>Last signal: {lastSignal}</span> : null}
                  </div>
                </div>

                {/* Tiny stats pills like Backloggd */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {steamMinutes > 0 && (
                    <span style={pill("#ecfeff")}>
                      Steam {minutesToHours(steamMinutes)}
                    </span>
                  )}

                  {psnMinutes > 0 && (
                    <span style={pill("#f0f9ff")}>
                      PSN {minutesToHours(psnMinutes)}
                    </span>
                  )}

                  {psnProgress != null && (
                    <span style={pill("#f0f9ff")}>PSN trophies {Math.round(Number(psnProgress))}%</span>
                  )}

                  {hasXbox && signals.xbox?.gamerscore_total != null && Number(signals.xbox.gamerscore_total) > 0 ? (
                    <span style={pill("#f0fdf4")}>
                      Xbox GS {signals.xbox.gamerscore_earned ?? 0}/{signals.xbox.gamerscore_total}
                    </span>
                  ) : null}

                  {!hasSteam && !hasPsn && !hasXbox ? <span style={pill("#fff7ed")}>No sync signal</span> : null}
                </div>
              </div>
            </div>

            {/* Two-column content like Minimap */}
            <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.7fr", gap: 16 }}>
              {/* Summary */}
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "white",
                  padding: 16,
                }}
              >
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>Summary</div>
                <div style={{ color: "#334155", lineHeight: 1.6 }}>
                  {release.games?.summary ?? "—"}
                </div>
              </div>

              {/* Info (developer/publisher/platforms/genres) */}
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "white",
                  padding: 16,
                  height: "fit-content",
                }}
              >
                <div style={{ fontWeight: 1000, marginBottom: 10 }}>Information</div>

                <div style={{ display: "grid", gap: 10, color: "#0f172a" }}>
                  <div style={{ color: "#64748b" }}>
                    <b style={{ color: "#0f172a" }}>Developer:</b>{" "}
                    {release.games?.developer ?? "—"}
                  </div>
                  <div style={{ color: "#64748b" }}>
                    <b style={{ color: "#0f172a" }}>Publisher:</b>{" "}
                    {release.games?.publisher ?? "—"}
                  </div>
                  <div style={{ color: "#64748b" }}>
                    <b style={{ color: "#0f172a" }}>Platform:</b> {platformLine}
                  </div>

                  <div style={{ color: "#64748b" }}>
                    <b style={{ color: "#0f172a" }}>Genres:</b>
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {genresList.length ? (
                        genresList.map((g: string) => (
                          <span key={g} style={chip()}>
                            {g}
                          </span>
                        ))
                      ) : (
                        <span style={{ color: "#94a3b8" }}>—</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Signals detail panel (explicitly shows what’s wired) */}
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 16,
                background: "white",
                padding: 16,
              }}
            >
              <div style={{ fontWeight: 1000, marginBottom: 10 }}>Signals</div>

              <div style={{ display: "grid", gap: 10 }}>
                {/* Steam - only for Steam releases */}
                {isSteamRelease && (
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>Steam</div>
                    {steamMinutes > 0 ? (
                      <div style={{ color: "#334155" }}>
                        Playtime: <b>{minutesToHours(steamMinutes)}</b>
                        {portfolio?.updated_at ? (
                          <span style={{ color: "#64748b" }}> • {timeAgo(portfolio.updated_at) ?? ""}</span>
                        ) : null}
                      </div>
                    ) : (
                      <div style={{ color: "#94a3b8" }}>—</div>
                    )}
                  </div>
                )}

                {/* PSN */}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>PlayStation</div>
                  {signals?.psn ? (
                    <div style={{ color: "#334155" }}>
                      {psnMinutes > 0 ? (
                        <>
                          Playtime: <b>{minutesToHours(psnMinutes)}</b>
                          {" • "}
                        </>
                      ) : null}
                      {psnProgress != null ? (
                        <>
                          Trophies: <b>{Math.round(Number(psnProgress))}%</b>
                        </>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>Trophies —</span>
                      )}
                      {signals.psn.last_updated_at ? (
                        <span style={{ color: "#64748b" }}> • {timeAgo(signals.psn.last_updated_at) ?? ""}</span>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ color: "#94a3b8" }}>—</div>
                  )}
                </div>

                {/* Xbox */}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>Xbox</div>
                  {signals?.xbox ? (
                    <div style={{ color: "#334155" }}>
                      {signals.xbox.gamerscore_total != null && Number(signals.xbox.gamerscore_total) > 0 ? (
                        <>
                          GS: <b>{signals.xbox.gamerscore_earned ?? 0}/{signals.xbox.gamerscore_total}</b>
                          {" • "}
                        </>
                      ) : null}
                      {signals.xbox.achievements_total != null && Number(signals.xbox.achievements_total) > 0 ? (
                        <>
                          Achievements: <b>{signals.xbox.achievements_earned ?? 0}/{signals.xbox.achievements_total}</b>
                        </>
                      ) : (
                        <span style={{ color: "#94a3b8" }}>Achievements —</span>
                      )}
                      {signals.xbox.last_updated_at ? (
                        <span style={{ color: "#64748b" }}> • {timeAgo(signals.xbox.last_updated_at) ?? ""}</span>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ color: "#94a3b8" }}>—</div>
                  )}
                </div>
              </div>
            </div>

            {/* TODO slots (we’ll wire these next): Tags, Media, Related games, etc */}
            {/* Trophy groups (only shown if game has DLC with separate trophy lists) */}
            {psnGroups.length > 0 && (
              <div
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 16,
                  background: "white",
                  padding: 16,
                }}
              >
                <div style={{ fontWeight: 1000, marginBottom: 10 }}>DLC Trophy Progress</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {psnGroups.map((g: any) => (
                    <span
                      key={String(g.trophy_group_id)}
                      style={{
                        fontSize: 12,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid #e5e7eb",
                        background: "white",
                        color: "#0f172a",
                        fontWeight: 800,
                      }}
                      title={g.trophy_group_name || `Group ${g.trophy_group_id}`}
                    >
                      🏆 {g.progress != null ? `${Math.round(Number(g.progress))}%` : "—"}{" "}
                      <span style={{ color: "#64748b", fontWeight: 700 }}>
                        ({g.earned ?? 0}/{g.total ?? 0})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ color: "#64748b", fontSize: 13 }}>
              Next: tags (emoji), developer/publisher pages, and media carousel like GameTrack.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrophyList({ trophies, earned }: { trophies: any[]; earned: any[] }) {
  const earnedSet = new Set(
    (earned || [])
      .map((t: any) => `${t?.trophyId ?? ""}:${t?.trophyGroupId ?? "default"}`)
      .filter(Boolean)
  );

  const items = Array.isArray(trophies) ? trophies : [];
  if (!items.length) return <div style={{ color: "#64748b" }}>No trophies returned.</div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((t: any) => {
        const key = `${t?.trophyId ?? ""}:${t?.trophyGroupId ?? "default"}`;
        const isEarned = earnedSet.has(key);

        const name = t?.trophyName ?? "Untitled trophy";
        const detail = t?.trophyDetail ?? "";
        const type = String(t?.trophyType ?? "").toLowerCase(); // bronze/silver/gold/platinum
        const icon = t?.trophyIconUrl ?? null;

        const badge =
          type === "platinum" ? "💎" : type === "gold" ? "🥇" : type === "silver" ? "🥈" : "🥉";

        return (
          <div
            key={key}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: 10,
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              background: isEarned ? "#f0fdf4" : "#fff",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                overflow: "hidden",
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                flexShrink: 0,
              }}
            >
              {icon ? (
                <img src={icon} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : null}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                  {badge} {name}
                </div>
                <div style={{ fontSize: 12, fontWeight: 900, color: isEarned ? "#166534" : "#64748b" }}>
                  {isEarned ? "Earned" : "Not earned"}
                </div>
              </div>

              {detail ? (
                <div style={{ marginTop: 4, color: "#334155", lineHeight: 1.4, fontSize: 13 }}>
                  {detail}
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AchievementList({ achievements, earned }: { achievements: any[]; earned: any[] }) {
  const earnedSet = new Set(
    (earned || [])
      .map((a: any) => String(a?.achievement_id ?? ""))
      .filter(Boolean)
  );

  const items = Array.isArray(achievements) ? achievements : [];
  if (!items.length) return <div style={{ color: "#64748b" }}>No achievements returned.</div>;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((a: any) => {
        const key = String(a?.achievement_id ?? "");
        // Check both the earned array and the earned field on the achievement object
        const isEarned = earnedSet.has(key) || Boolean(a?.earned);

        const name = a?.achievement_name ?? "Untitled achievement";
        const description = a?.achievement_description ?? "";
        const gamerscore = a?.gamerscore != null ? Number(a.gamerscore) : null;
        const rarity = a?.rarity_percentage != null ? Number(a.rarity_percentage) : null;
        const icon = a?.achievement_icon_url ?? null;

        return (
          <div
            key={key}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: 10,
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              background: isEarned ? "#f0fdf4" : "#fff",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                overflow: "hidden",
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                flexShrink: 0,
              }}
            >
              {icon ? (
                <img src={icon} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : null}
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ fontWeight: 900, lineHeight: 1.2 }}>
                  {name}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  {gamerscore != null && (
                    <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>
                      ✖︎ {gamerscore}G
                    </div>
                  )}
                  <div style={{ fontSize: 12, fontWeight: 900, color: isEarned ? "#166534" : "#64748b" }}>
                    {isEarned ? "Earned" : "Not earned"}
                  </div>
                </div>
              </div>

              {description ? (
                <div style={{ marginTop: 4, color: "#334155", lineHeight: 1.4, fontSize: 13 }}>
                  {description}
                </div>
              ) : null}

              {isEarned && a?.earned_at ? (
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>
                  Unlocked: {new Date(a.earned_at).toLocaleString()}
                </div>
              ) : null}

              {rarity != null && (
                <div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>
                  {rarity.toFixed(2)}% of players have this
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
