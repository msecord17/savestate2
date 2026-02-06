"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Row = {
  user_id: string;
  display_name: string;
  score: number;
  era_snes_score: number;
};

type Api = {
  ok: boolean;
  total_users: number;
  me: {
    user_id: string;
    global_rank: number;
    global_top_percent: number;
    snes_rank: number;
    snes_top_percent: number;
  };
  global_top: Row[];
  global_window: Row[];
  snes_top: Row[];
};

function fmt(n: number) {
  return new Intl.NumberFormat().format(n);
}

export default function LeaderboardPage() {
  // For now we’re mocking user_id as "me".
  // Later we’ll pass real Supabase user.id.
  const userId = "me";

  const [data, setData] = useState<Api | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErr("");

        const res = await fetch(`/api/leaderboard/mock?user_id=${encodeURIComponent(userId)}`);
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;

        if (!res.ok) throw new Error(json?.error || `Failed (${res.status})`);
        setData(json);
      } catch (e: any) {
        setErr(e?.message || "Failed to load leaderboard");
        setData(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const me = data?.me;

  const globalTop = data?.global_top ?? [];
  const snesTop = data?.snes_top ?? [];
  const totalUsers = data?.total_users ?? 0;

  const myRow = useMemo(() => {
    if (!data) return null;
    const all = data.global_top.concat(data.global_window);
    return all.find((r) => r.user_id === data.me.user_id) ?? null;
  }, [data]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 6 }}>Leaderboard</h1>
          <div style={{ color: "#6b7280" }}>
            Percentiles over sweat. (For now: mock users, real vibes.)
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/profile" style={{ color: "#2563eb" }}>
            ← Profile
          </Link>
          <Link href="/gamehome" style={{ color: "#2563eb" }}>
            GameHome →
          </Link>
        </div>
      </div>

      {loading && <div style={{ marginTop: 14, color: "#6b7280" }}>Loading…</div>}
      {err && (
        <div style={{ marginTop: 14, color: "#b91c1c" }}>
          {err}
        </div>
      )}

      {!loading && data && (
        <>
          {/* Your percentile cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
              marginTop: 18,
            }}
          >
            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 14,
                background: "white",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Global standing</div>
              <div style={{ color: "#0f172a", fontSize: 18, fontWeight: 900 }}>
                Top {me?.global_top_percent}%{" "}
                <span style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}>
                  (#{me?.global_rank} of {totalUsers})
                </span>
              </div>
              <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                Your Gamer Lifetime Score compared to all users (mock dataset).
              </div>
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                padding: 14,
                background: "white",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>SNES-era standing</div>
              <div style={{ color: "#0f172a", fontSize: 18, fontWeight: 900 }}>
                Top {me?.snes_top_percent}%{" "}
                <span style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}>
                  (#{me?.snes_rank} of {totalUsers})
                </span>
              </div>
              <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                Era percentile uses your “SNES activity” slice (mocked from the era model).
              </div>
            </div>
          </div>

          {/* Leaderboards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 12,
              marginTop: 16,
            }}
          >
            {/* Global top */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "white" }}>
              <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontWeight: 900 }}>All-user leaderboard</div>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                  You’re highlighted. (Top 20 shown.)
                </div>
              </div>

              <div style={{ padding: 14, display: "grid", gap: 10 }}>
                {globalTop.map((r, idx) => {
                  const rank = idx + 1;
                  const isMe = r.user_id === me?.user_id;

                  return (
                    <div
                      key={r.user_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 10px",
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: isMe ? "#f1f5f9" : "white",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 28,
                            textAlign: "right",
                            color: "#64748b",
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          #{rank}
                        </div>
                        <div>
                          <div style={{ fontWeight: 900 }}>
                            {r.display_name}
                            {isMe ? " (you)" : ""}
                          </div>
                          <div style={{ color: "#64748b", fontSize: 12 }}>
                            SNES slice: {fmt(r.era_snes_score)}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 900 }}>{fmt(r.score)}</div>
                        <div style={{ color: "#64748b", fontSize: 12 }}>score</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* SNES top */}
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, background: "white" }}>
              <div style={{ padding: 14, borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontWeight: 900 }}>SNES-era leaderboard</div>
                <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                  Top 20 by SNES-era score.
                </div>
              </div>

              <div style={{ padding: 14, display: "grid", gap: 10 }}>
                {snesTop.map((r, idx) => {
                  const rank = idx + 1;
                  const isMe = r.user_id === me?.user_id;

                  return (
                    <div
                      key={r.user_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 10px",
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: isMe ? "#f1f5f9" : "white",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 28,
                            textAlign: "right",
                            color: "#64748b",
                            fontSize: 12,
                            fontWeight: 900,
                          }}
                        >
                          #{rank}
                        </div>
                        <div style={{ fontWeight: 900 }}>
                          {r.display_name}
                          {isMe ? " (you)" : ""}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 900 }}>{fmt(r.era_snes_score)}</div>
                        <div style={{ color: "#64748b", fontSize: 12 }}>SNES score</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Tiny “how this works” */}
          <div style={{ marginTop: 14, color: "#64748b", fontSize: 13 }}>
            <strong style={{ color: "#0f172a" }}>Next upgrade:</strong> swap the mock API for real
            Supabase queries + compute percentiles per cohort (platform, era, genre, etc.).
          </div>
        </>
      )}
    </div>
  );
}
