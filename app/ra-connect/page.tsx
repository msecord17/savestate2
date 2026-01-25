"use client";

import { useState } from "react";
import Link from "next/link";

export default function RaConnectPage() {
  const [ra_username, setUser] = useState("");
  const [ra_api_key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    try {
      setSaving(true);
      setMsg("");

      const res = await fetch("/api/ra/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ra_username, ra_api_key }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setMsg("Connected ✅");
    } catch (e: any) {
      setMsg(e?.message || "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 640, margin: "0 auto" }}>
      <Link href="/gamehome" style={{ color: "#2563eb" }}>← Back</Link>

      <h1 style={{ fontSize: 26, fontWeight: 900, marginTop: 12 }}>Connect RetroAchievements</h1>
      <p style={{ color: "#64748b", marginTop: 8 }}>
        Enter your RetroAchievements username + Web API key.
      </p>

      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <label style={{ fontWeight: 900 }}>
          Username
          <input
            value={ra_username}
            onChange={(e) => setUser(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #e5e7eb", marginTop: 6 }}
            placeholder="Your RA username"
          />
        </label>

        <label style={{ fontWeight: 900 }}>
          Web API Key
          <input
            value={ra_api_key}
            onChange={(e) => setKey(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #e5e7eb", marginTop: 6 }}
            placeholder="Your RA Web API key"
          />
        </label>

        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#0f172a",
            color: "white",
            fontWeight: 900,
            cursor: "pointer",
            marginTop: 6,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>

        {msg ? <div style={{ color: "#64748b" }}>{msg}</div> : null}
      </div>
    </div>
  );
}
