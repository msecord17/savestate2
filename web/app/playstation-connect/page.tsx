"use client";

import { useState } from "react";
import Link from "next/link";

export default function PlayStationConnectPage() {
  const [npsso, setNpsso] = useState("");
  const [onlineId, setOnlineId] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  async function connect() {
    if (!npsso.trim()) {
      setMsg("Please paste your NPSSO token.");
      return;
    }

    if (!onlineId.trim()) {
      setMsg("Please enter your PSN Online ID.");
      return;
    }

    try {
      setLoading(true);
      setMsg("");

      const res = await fetch("/api/auth/psn/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ npsso: npsso.trim(), onlineId: onlineId.trim() }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) {
        throw new Error(data?.error || `Failed (${res.status})`);
      }

      setMsg("PlayStation connected ✅ You can now sync your games.");
    } catch (e: any) {
      setMsg(e?.message || "Failed to connect PlayStation");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>
        Connect PlayStation
      </h1>

      <p style={{ color: "#64748b", marginBottom: 18 }}>
        Import your PlayStation games and play history to power your Gamer
        Lifetime Score.
      </p>

      {/* Connect box */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          padding: 14,
          background: "white",
          marginBottom: 24,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 6 }}>
          PSN Online ID
        </div>

        <input
          value={onlineId}
          onChange={(e) => setOnlineId(e.target.value)}
          placeholder="Your PlayStation username"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            marginBottom: 16,
          }}
        />

        <div style={{ fontWeight: 900, marginBottom: 6 }}>
          NPSSO Token
        </div>

        <input
          value={npsso}
          onChange={(e) => setNpsso(e.target.value)}
          placeholder="Paste your NPSSO token here"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            marginBottom: 10,
          }}
        />

        <button
          onClick={connect}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "white",
            fontWeight: 900,
            cursor: "pointer",
          }}
        >
          {loading ? "Connecting…" : "Connect PlayStation"}
        </button>

        {msg && (
          <div style={{ marginTop: 10, color: "#64748b", fontSize: 14 }}>
            {msg}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div
  style={{
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 16,
    background: "#f8fafc",
  }}
>
  <h2 style={{ fontSize: 18, fontWeight: 900, marginBottom: 8 }}>
    🔐 How to connect
  </h2>

  <p style={{ color: "#334155", marginBottom: 12 }}>
    Sony doesn’t provide a public API login for gameplay data. This token allows
    SaveState to <strong>read your own PlayStation library and play history</strong>.
    We never see your password, and this is read-only.
  </p>

  <div style={{ marginBottom: 14 }}>
    <strong style={{ color: "#334155" }}>Step 1: Enter your PSN Online ID</strong>
    <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>
      This is your PlayStation username (e.g., "gamer123").
    </p>
  </div>

  <div style={{ marginBottom: 8 }}>
    <strong style={{ color: "#334155" }}>Step 2: Get your NPSSO token</strong>
  </div>

  <ol style={{ paddingLeft: 18, color: "#334155", lineHeight: 1.6 }}>
    <li>
      Open a web browser and sign in to{" "}
      <a
        href="https://www.playstation.com/"
        target="_blank"
        rel="noreferrer"
        style={{ color: "#2563eb" }}
      >
        playstation.com
      </a>{" "}
      (or{" "}
      <a
        href="https://account.sonyentertainmentnetwork.com/"
        target="_blank"
        rel="noreferrer"
        style={{ color: "#2563eb" }}
      >
        account.sonyentertainmentnetwork.com
      </a>
      ).
    </li>

    <li>
      In the <strong>same browser tab</strong>, visit:
      <br />
      <code>https://ca.account.sony.com/api/v1/ssocookie</code>
    </li>

    <li>
      You’ll see a small JSON response. Look for:
      <br />
      <code>"npsso":"&lt;64-character-code&gt;"</code>
    </li>

    <li>
      Copy <strong>only</strong> the 64-character alphanumeric code
      <br />
      <span style={{ color: "#64748b" }}>
        (do not include quotes or the word “npsso”)
      </span>
    </li>

    <li>
      Paste it above and click <strong>Connect PlayStation</strong>.
    </li>
  </ol>

  <div style={{ marginTop: 12, color: "#64748b", fontSize: 14 }}>
    🔒 Read-only • ⏳ Token may expire • ❌ No purchases • 🔄 Disconnect anytime
  </div>
</div>
    </div>
  );
}
