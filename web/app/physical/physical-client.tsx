"use client";

import { useEffect, useMemo, useState } from "react";

type PhysicalItem = {
  id: string;
  item_type: string;
  title: string;
  platform_key: string | null;
  condition: string | null;
  region: string | null;
  quantity: number;
  acquired_date: string | null;
  notes: string | null;
  created_at: string;
};

export default function PhysicalIntakeClient() {
  const [items, setItems] = useState<PhysicalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [type, setType] = useState("game");

  // form
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("");
  const [condition, setCondition] = useState("");
  const [region, setRegion] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/physical/items", { cache: "no-store" });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? "Failed");
      setItems(j.items ?? []);
    } catch (e: any) {
      setErr(e.message ?? "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((it) => {
      if (type && it.item_type !== type) return false;
      if (!needle) return true;
      return (
        (it.title ?? "").toLowerCase().includes(needle) ||
        (it.platform_key ?? "").toLowerCase().includes(needle) ||
        (it.region ?? "").toLowerCase().includes(needle)
      );
    });
  }, [items, q, type]);

  async function addItem() {
    setErr(null);
    const payload = {
      item_type: type,
      title,
      platform_key: platform || null,
      condition: condition || null,
      region: region || null,
      quantity,
      notes: notes || null,
    };

    try {
      const r = await fetch("/api/physical/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!j?.ok) throw new Error(j?.error ?? "Failed");
      setTitle("");
      setPlatform("");
      setCondition("");
      setRegion("");
      setQuantity(1);
      setNotes("");
      await refresh();
    } catch (e: any) {
      setErr(e.message ?? "Failed");
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Physical Intake</h1>
      </div>

      {err ? (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm">
          {err}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-sm"
          >
            <option value="game">Game</option>
            <option value="console">Console</option>
            <option value="accessory">Accessory</option>
            <option value="other">Other</option>
          </select>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (required)"
            className="min-w-[240px] flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />

          <input
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            placeholder="Platform key (optional)"
            className="min-w-[160px] rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            placeholder="Condition (CIB/loose/etc)"
            className="min-w-[200px] rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
          <input
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Region (NA/EU/JP)"
            className="min-w-[160px] rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={quantity}
            min={1}
            onChange={(e) => setQuantity(Number(e.target.value || 1))}
            className="w-24 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
          />
          <button
            onClick={addItem}
            className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/15 transition"
          >
            Add
          </button>
        </div>

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          className="min-h-[60px] rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <div className="text-sm text-white/70">
          {loading ? "Loading…" : `${filtered.length} items`}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your physical items…"
          className="w-full max-w-sm rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
        />
      </div>

      <div className="mt-3 grid gap-2">
        {filtered.map((it) => (
          <div
            key={it.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] p-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{it.title}</div>
              <div className="text-xs text-white/60">
                {it.item_type}
                {it.platform_key ? ` • ${it.platform_key}` : ""}
                {it.region ? ` • ${it.region}` : ""}
                {it.condition ? ` • ${it.condition}` : ""}
                {it.quantity ? ` • x${it.quantity}` : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
