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

  async function loadMe() {
    const res = await fetch("/api/profile/me");
    const data = await res.json();
    setUser(data?.user ?? null);
    setProfile(data?.profile ?? null);
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

          {/* Gamer Lifetime Score */}
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 14,
              background: "white",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
              <div style={{ fontWeight: 900, fontSize: 16 }}>Gamer Lifetime Score</div>
              <div style={{ color: "#64748b", fontSize: 13 }}>
                computed from your portfolio
              </div>
            </div>

            {scoreErr ? (
              <div style={{ color: "#b91c1c", marginTop: 10 }}>{scoreErr}</div>
            ) : null}

            {!scoreLoading && breakdown ? (
              <>
                <div style={{ marginTop: 12, display: "flex", alignItems: "baseline", gap: 10 }}>
                  <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1 }}>
                    {breakdown.total_score}
                  </div>
                  <div style={{ color: "#64748b" }}>
                    points
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: 10,
                  }}
                >
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 900 }}>Playtime</div>
                    <div style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}>
                      {breakdown.total_playtime_hours} hours
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 900 }}>
                      +{breakdown.total_playtime_points} pts
                    </div>
                  </div>

                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 900 }}>Library Size</div>
                    <div style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}>
                      {breakdown.total_games_owned} games
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 900 }}>
                      +{breakdown.total_games_owned_points} pts
                    </div>
                  </div>

                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 900 }}>Completed</div>
                    <div style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}>
                      {breakdown.completed_games} games
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 900 }}>
                      +{breakdown.completed_points} pts
                    </div>
                  </div>

                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 900 }}>Platforms</div>
                    <div style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}>
                      {breakdown.unique_platforms} unique
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 900 }}>
                      +{breakdown.unique_platform_points} pts
                    </div>
                  </div>

                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 10 }}>
                    <div style={{ fontWeight: 900 }}>RetroAchievements</div>
                    <div style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}>
                      {breakdown.ra_mastered_games} mastered (stub for now)
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 900 }}>
                      +{breakdown.ra_mastered_points} pts
                    </div>
                  </div>
                </div>

                <div style={{ color: "#64748b", fontSize: 12, marginTop: 10 }}>
                  Note: RetroAchievements "mastered" points are currently 0 until we wire RA mastery into the DB.
                </div>
              </>
            ) : null}
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
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 14,
              padding: 14,
              background: "white",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>RetroAchievements</div>

            {profile?.ra_username ? (
              <div style={{ color: "#0f172a" }}>
                Connected ✅{" "}
                <span style={{ color: "#64748b" }}>{profile.ra_username}</span>

                {profile?.ra_connected_at ? (
                  <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                    Connected: {new Date(profile.ra_connected_at).toLocaleString()}
                  </div>
                ) : null}

                <div style={{ marginTop: 10 }}>
                  <Link href="/ra-sync" style={{ color: "#2563eb" }}>
                    RetroAchievements Sync →
                  </Link>
                </div>
              </div>
            ) : (
              <a
                href="/api/auth/retroachievements/start"
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
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
