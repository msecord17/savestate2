"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PhysicalIntakeCard from "@/components/portfolio/PhysicalIntakeCard";

export default function AddPhysicalPageClient() {
  const [items, setItems] = useState<any[]>([]);
  const [err, setErr] = useState("");

  function load() {
    setErr("");
    fetch("/api/portfolio/physical/list")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setItems(Array.isArray(d.items) ? d.items : []);
        else setErr(d?.error || "Failed to load physical items");
      })
      .catch(() => setErr("Failed to load physical items"));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <h1 style={{ fontSize: 26, marginBottom: 12 }}>Add Physical</h1>
        <Link href="/my-portfolio" style={{ color: "#2563eb", fontWeight: 800 }}>
          ← Back to portfolio
        </Link>
      </div>

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 12,
          background: "white",
          marginBottom: 16,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 16 }}>Quick entry</div>
        <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
          Add physical games / systems / accessories.
        </div>

        <div style={{ marginTop: 10 }}>
          <PhysicalIntakeCard onCreated={load} />
        </div>
      </div>

      <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 8 }}>Recent physical items</div>
      {err ? (
        <div style={{ color: "#b91c1c", fontSize: 13 }}>{err}</div>
      ) : items.length === 0 ? (
        <div style={{ color: "#6b7280", fontSize: 13 }}>No physical items yet.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.slice(0, 20).map((it) => (
            <div
              key={it.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.title}
                </div>
                <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                  {it.kind ?? "other"}
                  {it.platform_key ? ` • ${it.platform_key}` : ""}
                  {it.condition ? ` • ${it.condition}` : ""}
                  {it.quantity ? ` • x${it.quantity}` : ""}
                </div>
              </div>
              <div style={{ color: "#94a3b8", fontSize: 12, flexShrink: 0 }}>
                {it.created_at ? new Date(it.created_at).toLocaleDateString() : ""}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
