"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, ListPlus } from "lucide-react";

type Props = { releaseId: string };

type ListRow = {
  id: string;
  name?: string | null;
  title?: string | null;
};

export default function AddToListMenu({ releaseId }: Props) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as any)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!open || lists || loading) return;

    (async () => {
      setLoading(true);
      setMsg(null);
      try {
        const res = await fetch("/api/lists");
        const json = await res.json().catch(() => null);

        if (!res.ok) {
          setMsg(json?.error || "Could not load lists");
          setLists([]);
          return;
        }

        const arr = Array.isArray(json)
          ? json
          : Array.isArray(json?.lists)
            ? json.lists
            : [];

        setLists(arr);
      } catch (e: any) {
        setMsg(e?.message || "Network error");
        setLists([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, lists, loading]);

  async function addToList(listId: string) {
    setBusyId(listId);
    setMsg(null);
    try {
      const res = await fetch("/api/lists/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_id: listId, release_id: releaseId }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg(json?.error || "Failed to add to list");
        return;
      }

      setOpen(false);
    } catch (e: any) {
      setMsg(e?.message || "Network error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 active:bg-white/10 text-[#F1F5F9] border border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors flex items-center gap-2 text-sm font-medium"
      >
        <ListPlus size={16} />
        <span className="hidden sm:inline">Add to List</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute top-full right-0 mt-2 w-64 bg-[#1A1F29] border border-[#222833] rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-[#222833]">
            <div className="text-xs text-[#A8B0BF] uppercase tracking-wide mb-2">
              Your Lists
            </div>

            {loading ? (
              <div className="text-sm text-[#A8B0BF]">Loading…</div>
            ) : msg ? (
              <div className="text-sm text-[#A8B0BF]">{msg}</div>
            ) : (lists ?? []).length === 0 ? (
              <div className="text-sm text-[#A8B0BF]">No lists yet.</div>
            ) : (
              (lists ?? []).map((l) => {
                const name = l.name ?? l.title ?? "Untitled";
                const busy = busyId === l.id;
                return (
                  <button
                    key={l.id}
                    disabled={busy}
                    onClick={() => addToList(l.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors text-sm text-[#F1F5F9]
                      ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    • {name}
                  </button>
                );
              })
            )}
          </div>

          <button
            className="w-full px-4 py-3 text-left hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors flex items-center gap-2 text-sm font-medium text-[#F2B84B]"
            onClick={() => setOpen(false)}
          >
            <ListPlus size={14} />
            <span>Create New List</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
