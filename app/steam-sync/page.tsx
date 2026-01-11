"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SteamSyncPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  async function runSync() {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/sync/steam", { method: "POST" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) {
        throw new Error(data?.error || `Sync failed (${res.status})`);
      }

      setResult(data);
      
      // Redirect to profile after a short delay
      setTimeout(() => {
        router.push("/profile");
      }, 2000);
    } catch (e: any) {
      setError(e?.message || "Steam sync failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runSync();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>Steam Sync</h1>

      {loading && (
        <div style={{ color: "#6b7280", marginBottom: 12 }}>Syncing your Steam library...</div>
      )}

      {error && (
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 4 }}>Error</div>
          <div>{error}</div>
        </div>
      )}

      {result && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ color: "#16a34a", fontWeight: 900, marginBottom: 4 }}>Sync Complete ✅</div>
          <div style={{ color: "#64748b", fontSize: 14 }}>
            {result.imported ? `Imported: ${result.imported} games` : null}
            {result.updated ? ` • Updated: ${result.updated} games` : null}
            {result.total ? ` • Total: ${result.total} games` : null}
            {result.note ? <div style={{ marginTop: 8 }}>{result.note}</div> : null}
          </div>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>
            Redirecting to profile...
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Link href="/profile" style={{ color: "#2563eb" }}>
          ← Back to Profile
        </Link>
      </div>
    </div>
  );
}
