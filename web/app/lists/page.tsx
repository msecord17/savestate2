"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ListRow = {
    id: string;
    title: string;
    description: string | null;
    is_curated: boolean;
    created_at: string;
    item_count?: number;
  };
  

export default function ListsPage() {
  const [lists, setLists] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [curatedLists, setCuratedLists] = useState<any[]>([]);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [smartTitle, setSmartTitle] = useState("");
const [smartStatus, setSmartStatus] = useState("");
const [smartPlatform, setSmartPlatform] = useState("");
const [smartErr, setSmartErr] = useState("");


  async function load() {
    setLoading(true);
    setErr("");

    try {
      const res = await fetch("/api/lists");
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);
      setLists(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load lists");
      setLists([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  
    fetch("/api/lists/curated")
      .then((r) => r.json())
      .then((d) => setCuratedLists(Array.isArray(d) ? d : []))
      .catch(() => setCuratedLists([]));
      
  }, []);
  

  async function createList() {
    setCreating(true);
    setErr("");

    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Create failed (${res.status})`);

      setTitle("");
      setDescription("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "Failed to create list");
    } finally {
      setCreating(false);
    }
  }

  async function createSmartList() {
    setSmartErr("");
    try {
      const statuses = smartStatus ? [smartStatus] : [];
      const platform_keys = smartPlatform ? [smartPlatform] : [];
  
      const res = await fetch("/api/lists/smart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: smartTitle,
          statuses,
          platform_keys,
        }),
      });
  
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
  
      if (!res.ok) {
        throw new Error(data?.error || `Failed (${res.status})`);
      }
  
      setSmartTitle("");
      setSmartStatus("");
      setSmartPlatform("");
      await load();

    } catch (e: any) {
      setSmartErr(e?.message || "Failed to create smart list");
    }
  }
  
  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
        <h1 style={{ fontSize: 26 }}>Lists</h1>
        <span style={{ color: "#6b7280" }}>Make your own collections.</span>
      </div>

      <div style={{ marginBottom: 14 }}>
        <Link href="/gamehome" style={{ color: "#2563eb" }}>
          ← Back to GameHome
        </Link>
      </div>

      {err && <div style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</div>}

      {/* Create */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 14,
          maxWidth: 560,
          marginBottom: 18,
          background: "white",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Create a list</div>

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="List title (e.g., ‘JRPGs to finish’)…"
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)…"
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}
          />

          <button
            onClick={createList}
            disabled={creating || !title.trim()}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              cursor: creating ? "not-allowed" : "pointer",
              opacity: creating || !title.trim() ? 0.6 : 1,
              width: 160,
            }}
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>

      {/* Create Smart List */}
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 14,
          maxWidth: 560,
          marginBottom: 18,
          background: "white",
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Create Smart List</div>

        {smartErr && (
          <div style={{ color: "#b91c1c", marginBottom: 8 }}>
            {smartErr}
          </div>
        )}

        <div style={{ display: "grid", gap: 10 }}>
          <input
            value={smartTitle}
            onChange={(e) => setSmartTitle(e.target.value)}
            placeholder="Title (e.g., SNES Completed)"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          />

          <select
            value={smartStatus}
            onChange={(e) => setSmartStatus(e.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          >
            <option value="">Any status</option>
            <option value="playing">playing</option>
            <option value="completed">completed</option>
            <option value="dropped">dropped</option>
            <option value="back_burner">back burner</option>
            <option value="wishlist">wishlist</option>
            <option value="own">own</option>
            <option value="owned">owned</option>
          </select>

          <input
            value={smartPlatform}
            onChange={(e) => setSmartPlatform(e.target.value)}
            placeholder='Platform key (e.g. "snes", "ps5")'
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          />

          <button
            onClick={createSmartList}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              cursor: "pointer",
              fontWeight: 700,
              width: 160,
            }}
          >
            Create Smart List
          </button>
        </div>
      </div>

{/* Curated lists */}
{curatedLists.length > 0 && (
  <>
    <div style={{ fontWeight: 900, marginTop: 12, marginBottom: 10 }}>
      Curated
    </div>

    <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
      {curatedLists.map((l: any) => (
        <Link
          key={l.id}
          href={`/lists/${l.id}`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 14,
              background: "white",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ fontWeight: 800 }}>
                {l.title ?? l.name ?? "Untitled list"}
              </div>

              {l?.is_curated && (
                <div
                  style={{
                    fontSize: 12,
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    color: "#0f172a",
                    lineHeight: 1.2,
                  }}
                  title="Curated list"
                >
                  ⭐ Curated
                </div>
              )}
            </div>

            <div style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}>
              {l.description || "—"}
            </div>
          </div>
        </Link>
      ))}
    </div>
  </>
)}



   {/* My lists */}
{loading && <div style={{ color: "#6b7280" }}>Loading…</div>}

{!loading && lists.length === 0 && (
  <div style={{ color: "#6b7280" }}>
    No lists yet. Create one above, then start adding games from My Portfolio.
  </div>
)}

<div style={{ display: "grid", gap: 12 }}>
{lists.map((l: any) => (
    <Link
      key={l.id}
      href={`/lists/${l.id}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 14,
          background: "white",
        }}
      >
        {/* Title + badges row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ fontWeight: 800 }}>{l.title ?? l.name ?? "Untitled list"}</div>


          {l?.is_smart && (
            <div
              style={{
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "white",
                color: "#0f172a",
                lineHeight: 1.2,
              }}
              title="This list is computed from rules"
            >
              ⚡ Smart
            </div>
          )}

{l?.is_curated && (
            <div
              style={{
                fontSize: 12,
                padding: "3px 8px",
                borderRadius: 999,
                border: "1px solid #e5e7eb",
                background: "white",
                color: "#0f172a",
                lineHeight: 1.2,
              }}
              title="Curated list"
            >
              ⭐ Curated
            </div>
          )}
        </div>

        {/* Description */}
        <div style={{ color: "#64748b", marginTop: 4, fontSize: 13 }}>
          {l.description || "—"}
        </div>
      </div>
    </Link>
  ))}
</div>
    </div>
  );
}