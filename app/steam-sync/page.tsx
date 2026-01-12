"use client";

import { useState } from "react";
import Link from "next/link";

function safeJsonParse(text: string) {
  try {
    return { ok: true as const, value: JSON.parse(text) };
  } catch {
    return { ok: false as const, value: null };
  }
}

export default function SteamSyncPage() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [output, setOutput] = useState<string>("");

  async function runSync() {
    setRunning(true);
    setStatus(null);
    setOutput("");

    try {
      const res = await fetch("/api/sync/steam", { method: "POST" });
      setStatus(res.status);

      const text = await res.text();

      // Try JSON first, fall back to raw text (fixes the “Unexpected token 'A'” crash)
      const parsed = safeJsonParse(text);

      if (!res.ok) {
        if (parsed.ok) {
          setOutput(JSON.stringify(parsed.value, null, 2));
        } else {
          setOutput(text || "(empty error response)");
        }
        return;
      }

      if (parsed.ok) {
        setOutput(JSON.stringify(parsed.value, null, 2));
      } else {
        setOutput(text || "(empty response)");
      }
    } catch (e: any) {
      setOutput(`Fetch failed: ${e?.message || String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>
        Steam Sync
      </h1>

      <div style={{ color: "#64748b", marginBottom: 18 }}>
        This pulls your owned Steam games + playtime into your Portfolio.
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={runSync}
          disabled={running}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "white",
            fontWeight: 900,
            cursor: running ? "not-allowed" : "pointer",
          }}
        >
          {running ? "Syncing…" : "Run Steam Sync"}
        </button>

        <Link href="/profile" style={{ color: "#2563eb" }}>
          ← Back to Profile
        </Link>
      </div>

      {status !== null && (
        <div style={{ marginTop: 14, color: status >= 400 ? "#b91c1c" : "#0f172a" }}>
          HTTP Status: <strong>{status}</strong>
        </div>
      )}

      {output ? (
        <pre
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background: "#0b1220",
            color: "#e2e8f0",
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          {output}
        </pre>
      ) : null}
    </div>
  );
}
