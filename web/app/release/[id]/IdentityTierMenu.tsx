"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Flame,
  Ghost,
  Heart,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";

type Props = {
  releaseId: string;
  value: string | null;
};

type Opt = {
  label: string;
  Icon: any;
  color: string;
};

const OPTIONS: Opt[] = [
  { label: "Core Memory", Icon: Heart, color: "#B794F6" },
  { label: "Hall of Fame", Icon: Star, color: "#F2B84B" },
  { label: "Clear Run", Icon: Trophy, color: "#4ECCA3" },
  { label: "Side Quest", Icon: Sparkles, color: "#7C5CFF" },
  { label: "Backlog Ghost", Icon: Ghost, color: "#A8B0BF" },
  { label: "Rage Quit", Icon: Flame, color: "#EF4444" },
];

export function getIdentityTierColor(label: string | null): string {
  if (!label) return "#F2B84B";
  const opt = OPTIONS.find((o) => o.label === label);
  return opt?.color ?? "#F2B84B";
}

export default function IdentityTierMenu({ releaseId, value }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => {
    if (!value) return null;
    return OPTIONS.find((o) => o.label === value) ?? null;
  }, [value]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as any)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function setTier(next: string | null) {
    setBusy(true);
    try {
      await fetch("/api/portfolio/release-meta/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_id: releaseId, identity_tier: next }),
      });
      window.dispatchEvent(new Event("gh:release_refresh"));
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  const tintBg = selected ? `${selected.color}15` : "rgba(255,255,255,0.06)";
  const tintBorder = selected ? `${selected.color}30` : "rgba(255,255,255,0.10)";
  const tintText = selected ? selected.color : "#A8B0BF";
  const Icon = selected?.Icon ?? Heart;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={`px-4 py-2.5 rounded-lg border transition-colors flex items-center gap-2 text-sm font-medium hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0
          ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
        style={{
          background: tintBg,
          borderColor: tintBorder,
          color: tintText,
        }}
      >
        <Icon size={16} />
        <span>{selected ? selected.label : "None"}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute top-full left-0 mt-2 bg-[#1A1F29] border border-[#222833] rounded-xl shadow-2xl z-50 overflow-hidden min-w-[260px]">
          <div className="px-4 py-3 border-b border-[#222833] text-xs text-[#A8B0BF]">
            Choose identity
          </div>

          <button
            type="button"
            onClick={() => setTier(null)}
            className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors text-left text-sm font-medium text-[#A8B0BF]"
          >
            <span className="opacity-90">None</span>
            {!value ? <Check size={14} className="ml-auto" /> : null}
          </button>

          {OPTIONS.map((opt) => {
            const isSel = value === opt.label;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => setTier(opt.label)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors text-left whitespace-nowrap"
                style={{ color: isSel ? opt.color : "#A8B0BF" }}
              >
                <opt.Icon size={14} />
                <span className="text-sm font-medium">{opt.label}</span>
                {isSel ? <Check size={14} className="ml-auto" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
