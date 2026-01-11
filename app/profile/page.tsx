"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ScoreBreakdown = {
  total_score: number;

  total_playtime_hours: number;
  total_playtime_points: number;

  total_games_owned: number;
  total_games_owned_points: number;

  completed_games: number;
  completed_points: number;

  unique_platforms: number;
  unique_platform_points: number;

  ra_mastered_games: number;
  ra_mastered_points: number;
};

function RAConnectForm({ onConnected }: { onConnected: () => void }) {
  const [ra, setRa] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  return (
    <div>
      <div style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>
        Enter your RetroAchievements username to connect.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={ra}
          onChange={(e) => setRa(e.target.value)}
          placeholder="RA username (e.g., matt123)"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            minWidth: 260,
          }}
        />

        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setMsg("");
            const ra_username = ra.trim();
            if (!ra_username) {
              setMsg("Enter a username first.");
              return;
            }

            try {
              setSaving(true);
              const res = await fetch("/api/auth/retroachievements/connect", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ra_username }),
              });

              const text = await res.text();
              const data = text ? JSON.parse(text) : null;

              if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

              setMsg("Connected ✅");
              setRa("");
              onConnected();
            } catch (e: any) {
              setMsg(e?.message || "Failed to connect");
            } finally {
              setSaving(false);
            }
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          Connect RA
        </button>

        {msg ? <div style={{ color: "#64748b", fontSize: 13 }}>{msg}</div> : null}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  const [scoreLoading, setScoreLoading] = useState(true);
  const [scoreErr, setScoreErr] = useState("");
  const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(null);
  const [globalPct, setGlobalPct] = useState<number | null>(null);

  async function loadMe() {
    const res = await fetch("/api/profile/me");
    const data = await res.json();
    setUser(data?.user ?? null);
    setProfile(data?.profile ?? null);

    // Pull leaderboard / percentile info
    try {
      const res = await fetch("/api/leaderboard/mock?user_id=me", { cache: "no-store" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (res.ok && data?.me?.global_top_percent != null) {
        setGlobalPct(data.me.global_top_percent);
      } else {
        setGlobalPct(null);
      }
    } catch (e: any) {
      setGlobalPct(null);
    }
  }

  async function loadScore() {
    setScoreLoading(true);
    setScoreErr("");

    try {
      const res = await fetch("/api/profile/score");
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Score failed (${res.status})`);

      setBreakdown(data?.breakdown ?? null);
    } catch (e: any) {
      setBreakdown(null);
      setScoreErr(e?.message || "Failed to load score");
    } finally {
      setScoreLoading(false);
    }
  }

  async function refreshAll() {
    await loadMe();
    await loadScore();
  }

  useEffect(() => {
    refreshAll().finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>Profile</h1>

      {(loading || scoreLoading) && <div style={{ color: "#6b7280" }}>Loading…</div>}

      {!loading && !user && (
        <div style={{ color: "#b91c1c" }}>
          You're not logged in. <Link href="/login">Log in</Link> first, then connect Steam / RetroAchievements.
        </div>
      )}

      {!loading && user && (
        <div
          style={{
            display: "grid",
            gap: 12,
            maxWidth: 900,
          }}
        >
          {/* Signed in */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 14,
              background: "white",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>
              Signed in as {user.email ?? user.id}
            </div>

            <div id="score" style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Gamer Lifetime Score (v1.1)</div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, minWidth: 220 }}>
                  <div style={{ color: "#64748b", fontSize: 12 }}>Score</div>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>{profile?.gamer_score_v11 ?? "—"}</div>

                  {typeof globalPct === "number" && (
                    <div style={{ marginTop: 6, color: "#64748b", fontSize: 12 }}>
                      Top <strong>{globalPct}%</strong> globally
                    </div>
                  )}
                </div>

                <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, minWidth: 220 }}>
                  <div style={{ color: "#64748b", fontSize: 12 }}>Confidence</div>
                  <div style={{ fontSize: 28, fontWeight: 900 }}>{profile?.gamer_score_v11_confidence ?? "—"}%</div>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/score/v11", { method: "GET" });
                      const ct = res.headers.get("content-type") || "";
                      const text = await res.text();

                      if (!ct.includes("application/json")) {
                        window.alert(`Non-JSON from score API (${res.status}).\n\n${text.slice(0, 300)}`);
                        return;
                      }

                      const data = text ? JSON.parse(text) : null;

                      if (!res.ok) {
                        window.alert(`Score API error (${res.status}): ${data?.error || "unknown"}`);
                        return;
                      }

                      // ✅ Update UI immediately (no waiting on /api/profile/me)
                      setProfile((prev: any) => ({
                        ...(prev ?? {}),
                        gamer_score_v11: data?.score_total ?? prev?.gamer_score_v11 ?? null,
                        gamer_score_v11_confidence: data?.confidence ?? prev?.gamer_score_v11_confidence ?? null,
                        gamer_score_v11_breakdown: data ?? prev?.gamer_score_v11_breakdown ?? null,
                        gamer_score_v11_updated_at: new Date().toISOString(),
                      }));
<Link
  href="/score-methodology"
  style={{ color: "#2563eb", fontSize: 13, marginTop: 6, display: "inline-block" }}
>
  What’s this score?
</Link>

                      // Optional: also refresh from server so it's "truthy"
                      await loadMe();

                      window.alert(`Updated ✅\nScore: ${data?.score_total}\nConfidence: ${data?.confidence}%`);
                    } catch (e: any) {
                      window.alert(`Recalc failed: ${e?.message || e}`);
                    }
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Recalculate score
                </button>

                <Link href="/era-onboarding" style={{ color: "#7c3aed", fontWeight: 900 }}>
                  Take the Era History quiz →
                </Link>
              </div>

              {profile?.gamer_score_v11_breakdown?.explain?.length ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Why is my score this?</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {profile.gamer_score_v11_breakdown.explain.map((x: any, idx: number) => (
                      <div
                        key={idx}
                        style={{
                          border: "1px solid #e5e7eb",
                          borderRadius: 12,
                          padding: 12,
                          background: "white",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ fontWeight: 900 }}>{x.label}</div>
                          <div style={{ fontWeight: 900 }}>+{x.points}</div>
                        </div>
                        <div style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}>{x.detail}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <Link href="/my-portfolio" style={{ color: "#2563eb" }}>
                My Portfolio →
              </Link>
              <Link href="/gamehome" style={{ color: "#2563eb" }}>
                GameHome →
              </Link>
              <button
                type="button"
                onClick={refreshAll}
                style={{
                  padding: "8px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Steam */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 14,
              background: "white",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Steam</div>

            {profile?.steam_id ? (
              <div style={{ color: "#0f172a" }}>
                Connected ✅{" "}
                <span style={{ color: "#64748b" }}>{profile.steam_id}</span>

                {profile?.steam_last_synced_at ? (
                  <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                    Last synced: {new Date(profile.steam_last_synced_at).toLocaleString()} •{" "}
                    {profile.steam_last_sync_count ?? 0} games
                  </div>
                ) : null}

                <div style={{ marginTop: 10, display: "flex", gap: 10 }}>
                  <Link href="/steam-sync" style={{ color: "#2563eb" }}>
                    Steam Sync →
                  </Link>
                </div>
              </div>
            ) : (
              <a
                href="/api/auth/steam/start"
                style={{
                  display: "inline-block",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "white",
                  fontWeight: 900,
                  textDecoration: "none",
                  color: "#0f172a",
                }}
              >
                Connect Steam
              </a>
            )}
          </div>

          {/* RetroAchievements */}
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>RetroAchievements</div>

            {profile?.ra_username ? (
              <div style={{ color: "#0f172a" }}>
                Connected ✅{" "}
                <span style={{ color: "#64748b" }}>{profile.ra_username}</span>

                {profile?.ra_last_synced_at ? (
                  <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                    Last synced: {new Date(profile.ra_last_synced_at).toLocaleString()} •{" "}
                    {profile.ra_last_sync_count ?? 0} games
                  </div>
                ) : null}

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/retroachievements-connect" style={{ color: "#2563eb" }}>
                    Update RA creds →
                  </Link>

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/sync/retroachievements", { method: "POST" });
                        const text = await res.text();
                        const data = text ? JSON.parse(text) : null;

                        if (!res.ok) {
                          window.alert(data?.error || `RA Sync failed (${res.status})`);
                          return;
                        }

                        window.alert(`RA Sync OK ✅ Imported ${data?.imported ?? 0} games`);
                        // Optional: recalc score after sync
                        await fetch("/api/score/v11");
                        // reload profile to refresh breakdown
                        // (assuming you already have loadMe() or load())
                        // @ts-ignore
                        if (typeof loadMe === "function") await loadMe();
                        // @ts-ignore
                        if (typeof load === "function") await load();
                      } catch (e: any) {
                        window.alert(e?.message || "RA Sync failed");
                      }
                    }}
                    style={{
                      marginTop: 10,
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Run RetroAchievements Sync
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <Link
                  href="/retroachievements-connect"
                  style={{
                    display: "inline-block",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    fontWeight: 900,
                    textDecoration: "none",
                    color: "#0f172a",
                  }}
                >
                  Connect RetroAchievements
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
