"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CircleSlash, Clock, Heart, Package, Play } from "lucide-react";

type Props = {
  value: "playing" | "played" | "backlog" | "wishlist" | "owned" | "dropped" | "";
  onSelect: (v: string) => void; // calls saveStatus(...)
  disabled?: boolean;
};

const STATES = [
  { id: "playing", label: "Playing", icon: <Play size={14} />, color: "#4ECCA3" },
  { id: "played", label: "Played", icon: <Check size={14} />, color: "#A8B0BF" },
  { id: "backlog", label: "Backlog", icon: <Clock size={14} />, color: "#6B7280" },
  { id: "wishlist", label: "Wishlist", icon: <Heart size={14} />, color: "#F472B6" },
  { id: "owned", label: "Owned", icon: <Package size={14} />, color: "#F2B84B" },
  { id: "dropped", label: "Dropped", icon: <CircleSlash size={14} />, color: "#EF4444" },
] as const;

export default function StatusMenu({ value, onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as any)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const current = useMemo(() => {
    return STATES.find((s) => s.id === value) ?? STATES[1];
  }, [value]);

  const MENU_STATES = value === "owned" ? STATES : STATES.filter((s) => s.id !== "owned");

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2 border border-white/10 hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors
          ${disabled ? "opacity-60 cursor-not-allowed" : ""}`}
        style={{
          background: `${current.color}15`,
          color: current.color,
        }}
      >
        {current.icon}
        <span>{current.label}</span>
        <ChevronDown
          size={14}
          className={`ml-2 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open ? (
        <div className="absolute top-full left-0 mt-2 w-56 bg-[#1A1F29] border border-[#222833] rounded-xl shadow-2xl z-50 overflow-hidden">
          {MENU_STATES.map((s) => {
            const isSel = value === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onSelect(s.id);
                  setOpen(false);
                }}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors text-left"
                style={{ color: isSel ? s.color : "#A8B0BF" }}
              >
                {s.icon}
                <span className="text-sm font-medium">{s.label}</span>
                {isSel ? <Check size={14} className="ml-auto" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
