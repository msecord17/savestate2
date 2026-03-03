"use client";

import { useState } from "react";

export default function PhysicalIntakeCard({ onCreated }: { onCreated?: () => void }) {
  const [kind, setKind] = useState<"game" | "system" | "accessory" | "other">("game");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  const [condition, setCondition] = useState<"" | "new" | "like_new" | "good" | "fair" | "poor">("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    if (!title.trim()) return setErr("Title required.");

    try {
      setSaving(true);
      const res = await fetch("/api/portfolio/physical/add", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          platform_key: platform.trim() || null,
          condition: condition || null,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Failed to add");

      setTitle("");
      setPlatform("");
      setCondition("");
      setNotes("");
      onCreated?.();
    } catch (e: any) {
      setErr(e?.message || "Failed to add");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {err && <div style={{ color: "#b91c1c", fontSize: 13 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={kind} onChange={(e) => setKind(e.target.value as any)} style={sel}>
          <option value="game">Game</option>
          <option value="system">System</option>
          <option value="accessory">Accessory</option>
          <option value="other">Other</option>
        </select>

        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g., Super Metroid)" style={inp} />
        <input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="Platform (optional)" style={inp} />
        <select value={condition} onChange={(e) => setCondition(e.target.value as any)} style={sel}>
          <option value="">Condition (optional)</option>
          <option value="new">New</option>
          <option value="like_new">Like New</option>
          <option value="good">Good</option>
          <option value="fair">Fair</option>
          <option value="poor">Poor</option>
        </select>
      </div>

      <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (variant, etc.)" style={inp} />

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={submit} disabled={saving} style={btn}>
          {saving ? "Adding…" : "Add to portfolio"}
        </button>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "white",
  minWidth: 220,
  flex: 1,
};

const sel: React.CSSProperties = {
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid #e5e7eb",
  background: "white",
};

const btn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #0f172a",
  background: "#0f172a",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};
