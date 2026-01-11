"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function RetroAchievementsConnectClient() {
  const [raUsername, setRaUsername] = useState("");
  const [raApiKey, setRaApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    // Optional: prefill username if already connected
    fetch("/api/profile/me")
      .then((r) => r.json())
      .then((d) => {
        if (d?.profile?.ra_username) setRaUsername(d.profile.ra_username);
      })
      .catch(() => {});
  }, []);

  async function save() {
    setErr("");
    setMsg("");
    setSaving(true);

    try {
      const res = await fetch("/api/profile/retroachievements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ra_username: raUsername.trim(),
          ra_api_key: raApiKey.trim(),
        }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Save failed (${res.status})`);

      setMsg("Saved ✅");
      setRaApiKey(""); // don’t keep it in UI state after save
    } catch (e: any) {
      setErr(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/profile" style={{ color: "#2563eb" }}>
          ← Back to Profile
        </Link>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>
        Connect RetroAchievements
      </h1>

      <div style={{ color: "#64748b", marginBottom: 16, maxWidth: 720 }}>
        Enter your RetroAchievements username and Web API key. You can find the key in
        RetroAchievements settings. We store it in your profile so we can sync your
        achievement progress.
      </div>

      {err && <div style={{ color: "#b91c1c", marginBottom: 10 }}>{err}</div>}
      {msg && <div style={{ color: "#64748b", marginBottom: 10 }}>{msg}</div>}

      <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800 }}>RA Username</div>
          <input
            value={raUsername}
            onChange={(e) => setRaUsername(e.target.value)}
            placeholder="e.g., matt123"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontWeight: 800 }}>RA Web API Key</div>
          <input
            type="password"
            value={raApiKey}
            onChange={(e) => setRaApiKey(e.target.value)}
            placeholder="Paste your API key"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
            }}
          />
          <div style={{ color: "#64748b", fontSize: 13 }}>
            Tip: treat this like a password. Don’t share it.
          </div>
        </label>

        <button
          onClick={save}
          disabled={saving}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "white",
            fontWeight: 900,
            cursor: "pointer",
            width: "fit-content",
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
