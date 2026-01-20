"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type ReleaseDetail = {
  id: string;
  display_title: string | null;
  platform_name: string | null;
  platform_key: string | null;
  platform_label?: string | null;
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

type Entry = {
  user_id: string;
  release_id: string;
  status: string | null;
  rating: number | null;
  playtime_minutes: number | null; // NOTE: ONLY meaningful for Steam releases per API logic
  updated_at: string | null;
  created_at: string | null;
} | null;

type Signals = {
  steam: { playtime_minutes: number; last_updated_at: string | null } | null;
  psn: {
    playtime_minutes: number | null;
    trophy_progress: number | null;
    trophies_earned: number | null;
    trophies_total: number | null;
    last_updated_at: string | null;
  } | null;
  xbox: {
    achievements_earned: number | null;
    achievements_total: number | null;
    gamerscore_earned: number | null;
    gamerscore_total: number | null;
    last_updated_at: string | null;
  } | null;
};

type ApiPayload = {
  release: ReleaseDetail;
  entry: Entry;
  signals: Signals;
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
  const [entry, setEntry] = useState<Entry>(null);
  const [signals, setSignals] = useState<Signals>({
    steam: null,
    psn: null,
    xbox: null,
  });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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

      setRelease(data?.release ?? null);
      setEntry(data?.entry ?? null);
      setSignals(
        data?.signals ?? {
          steam: null,
          psn: null,
          xbox: null,
        }
      );
    } catch (e: any) {
      setErr(e?.message || "Failed to load release");
      setRelease(null);
      setEntry(null);
      setSignals({ steam: null, psn: null, xbox: null });
    } finally {
      setLoading(false);
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
  const currentStatus = String(entry?.status ?? "owned");

  const hasSteam = !!signals?.steam && Number(signals.steam.playtime_minutes || 0) > 0;
  const hasPsn = !!signals?.psn;
  const hasXbox = !!signals?.xbox;

  const lastSignal = useMemo(() => {
    const a = signals?.steam?.last_updated_at ?? null;
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
                  {hasSteam ? (
                    <span style={pill("#ecfeff")}>
                      Steam {minutesToHours(Number(signals.steam!.playtime_minutes || 0))}
                    </span>
                  ) : null}

                  {hasPsn && signals.psn?.playtime_minutes != null ? (
                    <span style={pill("#f0f9ff")}>
                      PSN {minutesToHours(Number(signals.psn.playtime_minutes || 0))}
                    </span>
                  ) : null}

                  {hasPsn && signals.psn?.trophy_progress != null ? (
                    <span style={pill("#f0f9ff")}>PSN trophies {Math.round(Number(signals.psn.trophy_progress))}%</span>
                  ) : null}

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
                {/* Steam */}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>Steam</div>
                  {signals.steam ? (
                    <div style={{ color: "#334155" }}>
                      Playtime: <b>{minutesToHours(Number(signals.steam.playtime_minutes || 0))}</b>
                      {signals.steam.last_updated_at ? (
                        <span style={{ color: "#64748b" }}> • {timeAgo(signals.steam.last_updated_at) ?? ""}</span>
                      ) : null}
                    </div>
                  ) : (
                    <div style={{ color: "#94a3b8" }}>—</div>
                  )}
                </div>

                {/* PSN */}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 900 }}>PlayStation</div>
                  {signals.psn ? (
                    <div style={{ color: "#334155" }}>
                      {signals.psn.playtime_minutes != null ? (
                        <>
                          Playtime: <b>{minutesToHours(Number(signals.psn.playtime_minutes || 0))}</b>
                          {" • "}
                        </>
                      ) : null}
                      {signals.psn.trophy_progress != null ? (
                        <>
                          Trophies: <b>{Math.round(Number(signals.psn.trophy_progress))}%</b>
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
                  {signals.xbox ? (
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
            <div style={{ color: "#64748b", fontSize: 13 }}>
              Next: tags (emoji), developer/publisher pages, and media carousel like GameTrack.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
