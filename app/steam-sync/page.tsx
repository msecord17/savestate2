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
  const [enriching, setEnriching] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  const [output, setOutput] = useState<string>("");
  const [enrichCursor, setEnrichCursor] = useState<string | null>(null);
  const [enrichHasMore, setEnrichHasMore] = useState(false);

  async function runSync() {
    setRunning(true);
    setStatus(null);
    setOutput("");

    try {
      const res = await fetch("/api/sync/steam-thin", { method: "POST" });
      setStatus(res.status);

      const text = await res.text();
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
        // After thin sync completes, trigger priority enrichment once
        try {
          const enrichRes = await fetch(
            "/api/sync/steam-enrich?mode=priority&limit=100",
            { method: "POST" }
          );
          const enrichText = await enrichRes.text();
          const enrichData = safeJsonParse(enrichText).value;
          if (enrichData?.next_cursor != null) {
            setEnrichCursor(enrichData.next_cursor);
            setEnrichHasMore(Boolean(enrichData.has_more));
          } else {
            setEnrichCursor(null);
            setEnrichHasMore(false);
          }
        } catch {
          // non-blocking
        }
      } else {
        setOutput(text || "(empty response)");
      }
    } catch (e: any) {
      setOutput(`Fetch failed: ${e?.message || String(e)}`);
    } finally {
      setRunning(false);
    }
  }

  async function runEnrichMore() {
    if (enrichCursor == null || enriching) return;
    setEnriching(true);
    try {
      const res = await fetch(
        `/api/sync/steam-enrich?mode=longtail&limit=100&cursor=${encodeURIComponent(enrichCursor)}`,
        { method: "POST" }
      );
      const text = await res.text();
      const data = safeJsonParse(text).value;
      if (data?.next_cursor != null) {
        setEnrichCursor(data.next_cursor);
        setEnrichHasMore(Boolean(data.has_more));
      } else {
        setEnrichCursor(null);
        setEnrichHasMore(false);
      }
      if (data && output) {
        setOutput(
          output +
            "\n\n--- Enrich ---\n" +
            JSON.stringify(
              {
                processed: data.processed,
                enriched: data.enriched,
                skipped: data.skipped,
                failed: data.failed,
                has_more: data.has_more,
              },
              null,
              2
            )
        );
      }
    } catch (e: any) {
      setOutput((o) => o + "\n\nEnrich error: " + (e?.message ?? String(e)));
    } finally {
      setEnriching(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>
        Steam Sync
      </h1>

      <div style={{ color: "#64748b", marginBottom: 18 }}>
        Thin sync: library + playtime + last played (no IGDB). After sync we run
        priority enrichment once; use “Continue enriching” for the rest.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
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
          {running ? "Syncing…" : "Run Steam Sync (thin)"}
        </button>

        {enrichHasMore && enrichCursor != null && (
          <button
            type="button"
            onClick={runEnrichMore}
            disabled={enriching}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              background: "#f0fdf4",
              fontWeight: 700,
              cursor: enriching ? "not-allowed" : "pointer",
            }}
          >
            {enriching ? "Enriching…" : "Continue enriching"}
          </button>
        )}

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
