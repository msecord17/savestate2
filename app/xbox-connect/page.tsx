"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function XboxConnectPage() {
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/profile/me");
    const data = await res.json().catch(() => null);
    setMe(data ?? null);
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const connected = !!me?.profile?.xbox_connected_at;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 8 }}>Connect Xbox</h1>

      <div style={{ color: "#64748b", marginBottom: 16 }}>
        This uses OpenXBL (xbl.io) to pull your public Xbox profile + achievements.
      </div>

      {loading ? <div style={{ color: "#6b7280" }}>Loading…</div> : null}

      {!loading && !me?.user ? (
        <div style={{ color: "#b91c1c" }}>
          You’re not logged in. <Link href="/login">Log in</Link> first.
        </div>
      ) : null}

      {!loading && me?.user ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 14,
            background: "white",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            Status: {connected ? "Connected ✅" : "Not connected"}
          </div>

          {!connected ? (
            <a
              href="/api/auth/xbox/start"
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
              Connect Xbox
            </a>
          ) : (
            <div style={{ color: "#64748b" }}>
              Connected at: {new Date(me.profile.xbox_connected_at).toLocaleString()}
              <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
                <Link href="/profile" style={{ color: "#2563eb" }}>
                  Back to Profile →
                </Link>

                <button
                  type="button"
                  onClick={async () => {
                    const res = await fetch("/api/sync/xbox", { method: "POST" });
                    const text = await res.text();
                    alert(`Status ${res.status}\n\n${text}`);
                    await load();
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
                  Run Xbox Sync (debug)
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
