"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

type ItemRow = {
  release_id: string;
  releases: {
    id: string;
    display_title: string;
    platform_name: string;
  } | null;
};

export default function ListDetailPage() {
  const pathname = usePathname();
  const listId = pathname?.split("/lists/")[1]?.split("/")[0];

  const [list, setList] = useState<any>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function removeFromList(releaseId: string) {
    try {
      const res = await fetch("/api/lists/items", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_id: list?.id ?? listId, release_id: releaseId }),
      });
  
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
  
      if (!res.ok) throw new Error(data?.error || `Remove failed (${res.status})`);
  
      // update UI immediately
      setItems((prev) => prev.filter((x) => x.release_id !== releaseId));
    } catch (e: any) {
      setErr(e?.message || "Failed to remove from list");
    }
  }
  
  useEffect(() => {
    if (!listId || listId === "undefined") return;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        const res = await fetch(`/api/lists/${listId}`);
        const raw = await res.text();

        const data = raw ? JSON.parse(raw) : null;

        if (!res.ok) {
          throw new Error(data?.error || `Failed (${res.status})`);
        }

        setList(data?.list ?? null);
        setItems(Array.isArray(data?.items) ? data.items : []);
      } catch (e: any) {
        setErr(e?.message || "Failed to load list");
        setList(null);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [listId]);

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/lists" style={{ color: "#2563eb" }}>
          ← Back to Lists
        </Link>
      </div>

      {loading && <div style={{ color: "#6b7280" }}>Loading…</div>}
      {err && <div style={{ color: "#b91c1c" }}>{err}</div>}

      {!loading && !err && list && (
        <>
          <h1 style={{ fontSize: 26, marginBottom: 6 }}>{list.title}</h1>
          {list.description && (
            <div style={{ color: "#64748b", marginBottom: 14 }}>
              {list.description}
            </div>
          )}

          {items.length === 0 ? (
            <div style={{ color: "#6b7280" }}>
              This list is empty. Add games from My Portfolio.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
             {items.map((r) => (
  <div
    key={r.release_id}
    style={{
      border: "1px solid #e5e7eb",
      borderRadius: 12,
      padding: 12,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 12,
      background: "white",
    }}
  >
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 900 }}>
        {r.releases?.display_title ?? "Unknown"}
      </div>
      <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
        {r.releases?.platform_name ?? "—"}
      </div>

      {r.releases?.id && (
        <div style={{ marginTop: 8 }}>
          <Link href={`/releases/${r.releases.id}`} style={{ color: "#2563eb" }}>
            Open details →
          </Link>
        </div>
      )}
    </div>

    <button
      onClick={() => removeFromList(r.release_id)}
      style={{
        border: "1px solid #e5e7eb",
        background: "white",
        borderRadius: 10,
        padding: "8px 10px",
        cursor: "pointer",
        fontSize: 12,
        whiteSpace: "nowrap",
      }}
    >
      Remove
    </button>
  </div>
))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
