"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Gamepad2, MonitorPlay } from "lucide-react";

type Hardware = {
  id: string;
  slug: string;
  display_name: string;
};

type Props = {
  releaseId: string;
  platformKey: string;
  currentItems: Array<{ hardware_id: string; label: string; slug?: string | null }>;
  onUpdate: () => void;
};

export function PlayedOnBlock({ releaseId, platformKey, currentItems, onUpdate }: Props) {
  const [eligiblePills, setEligiblePills] = useState<Hardware[]>([]);
  const [handheldDropdown, setHandheldDropdown] = useState<Hardware[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const primarySlug = currentItems[0]?.slug ?? currentItems[0]?.label?.toLowerCase().replace(/\s+/g, "_");
  const primaryLabel = currentItems[0]?.label ?? null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/portfolio/played-on/eligible?platformKey=${encodeURIComponent(platformKey)}`
        );
        const json = await res.json().catch(() => null);
        if (!cancelled && json?.ok) {
          setEligiblePills(json.eligiblePills ?? []);
          setHandheldDropdown(json.handheldDropdown ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [platformKey]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setDropdownOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function setPlayedOn(slug: string | null) {
    setSaving(true);
    try {
      const res = await fetch("/api/portfolio/played-on/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          release_id: releaseId,
          hardware_slug: slug,
          source: "manual",
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed");
      setDropdownOpen(false);
      onUpdate();
      window.dispatchEvent(new CustomEvent("played-on-updated", { detail: { releaseId } }));
    } catch (e: any) {
      console.error("[PlayedOnBlock] set failed:", e?.message);
    } finally {
      setSaving(false);
    }
  }

  function isSelected(h: Hardware) {
    const slug = h.slug?.toLowerCase() ?? "";
    const label = h.display_name?.toLowerCase() ?? "";
    const cur = primaryLabel?.toLowerCase() ?? "";
    const curSlug = primarySlug?.toLowerCase() ?? "";
    return (
      slug === curSlug ||
      label === cur ||
      cur.includes(label) ||
      label.includes(cur) ||
      curSlug === slug
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-[#A8B0BF] uppercase tracking-wide mb-2">Played On</div>

      {loading ? (
        <div className="text-sm text-[#A8B0BF]">Loading…</div>
      ) : (
        <>
          {/* Pills: eligible native platforms */}
          <div className="flex flex-wrap gap-2">
            {primaryLabel && (
              <button
                type="button"
                disabled={saving}
                onClick={() => setPlayedOn(null)}
                className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-[#A8B0BF] hover:bg-white/10 transition-colors text-xs"
              >
                Clear
              </button>
            )}
            {eligiblePills.map((h) => {
              const label = h.display_name ?? h.slug ?? "";
              const isPc = /pc|windows|steam deck|mac/i.test(label);
              const Icon = isPc ? MonitorPlay : Gamepad2;
              const selected = isSelected(h);

              return (
                <button
                  key={h.id}
                  type="button"
                  disabled={saving}
                  onClick={() => setPlayedOn(h.slug)}
                  className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-colors text-left
                    ${selected
                      ? "bg-[#F2B84B]/20 text-[#F2B84B] border border-[#F2B84B]/40"
                      : "bg-white/5 border border-white/10 text-[#F1F5F9] hover:bg-white/10"
                    }
                    ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <Icon size={14} className="text-[#A8B0BF] shrink-0" />
                  <span className="text-xs font-medium">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Dropdown: modern retro handhelds (emulation) */}
          {handheldDropdown.length > 0 && (
            <div className="relative" ref={ref}>
              <button
                type="button"
                disabled={saving}
                onClick={() => setDropdownOpen((v) => !v)}
                className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-[#F1F5F9] border border-white/10 transition-colors flex items-center gap-2 text-sm font-medium"
              >
                <span className="text-xs text-[#A8B0BF]">Emulated on</span>
                <ChevronDown
                  size={14}
                  className={`transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                />
              </button>

              {dropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-[#1A1F29] border border-[#222833] rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#222833] text-xs text-[#A8B0BF]">
                    Modern handhelds
                  </div>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setPlayedOn(null)}
                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left text-sm text-[#A8B0BF]
                      ${!primaryLabel ? "text-[#F2B84B]" : ""}
                      ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <span className="font-medium">Clear</span>
                    {!primaryLabel ? <Check size={14} className="ml-auto" /> : null}
                  </button>
                  {handheldDropdown.map((h) => {
                    const sel = isSelected(h);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        disabled={saving}
                        onClick={() => setPlayedOn(h.slug)}
                        className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition-colors text-left text-sm
                          ${sel ? "text-[#F2B84B]" : "text-[#A8B0BF]"}
                          ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        <Gamepad2 size={14} className="shrink-0" />
                        <span className="font-medium">{h.display_name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
