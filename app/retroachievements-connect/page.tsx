"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function RetroAchievementsConnectPage() {
  const sp = useSearchParams();
  const returnTo = sp.get("returnTo") || "/api/auth/retroachievements/callback";

  const [u, setU] = useState("");

  const callbackUrl = useMemo(() => {
    const base = returnTo;
    const q = new URLSearchParams({ u: u.trim() });
    return `${base}?${q.toString()}`;
  }, [returnTo, u]);

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>
        Connect RetroAchievements
      </h1>

      <div style={{ color: "#64748b", marginBottom: 14 }}>
        MVP mode: enter your RetroAchievements username. (We’ll add stronger verification later.)
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          value={u}
          onChange={(e) => setU(e.target.value)}
          placeholder="RA username"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
          }}
        />

        <a
          href={u.trim() ? callbackUrl : "#"}
          onClick={(e) => {
            if (!u.trim()) e.preventDefault();
          }}
          style={{
            display: "inline-block",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "white",
            fontWeight: 900,
            textDecoration: "none",
            color: "#0f172a",
            cursor: u.trim() ? "pointer" : "not-allowed",
            opacity: u.trim() ? 1 : 0.6,
          }}
        >
          Connect
        </a>
      </div>

      <div style={{ marginTop: 16 }}>
        <Link href="/profile" style={{ color: "#2563eb" }}>
          ← Back to Profile
        </Link>
      </div>
    </div>
  );
}
