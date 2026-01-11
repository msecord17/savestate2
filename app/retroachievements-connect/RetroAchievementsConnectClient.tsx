"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function RetroAchievementsConnectClient() {
  const sp = useSearchParams();
  const status = sp.get("ra") || "";

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>
        RetroAchievements
      </h1>

      {status === "connected" && (
        <div style={{ color: "#16a34a", marginBottom: 12 }}>
          Connected ✅
        </div>
      )}

      {status && status !== "connected" && (
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>
          Error: {status}
        </div>
      )}

      <div style={{ color: "#64748b", marginBottom: 14 }}>
        Connect your RetroAchievements account to sync your retro library + progress.
      </div>

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

      <div style={{ marginTop: 14 }}>
        <Link href="/profile" style={{ color: "#2563eb" }}>
          ← Back to Profile
        </Link>
      </div>
    </div>
  );
}
