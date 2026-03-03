"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Gamepad2, MonitorPlay } from "lucide-react";
import { chipClass, chipClassAccent } from "@/lib/chipStyles";

type HardwareItem = {
  hardware_id: string;
  label: string;
  slug?: string | null;
};

type SelectedItem = HardwareItem & {
  is_primary?: boolean;
  source?: string | null;
};

type Props = {
  releaseId: string;
  selected: SelectedItem[];
  availableHardware: HardwareItem[];
  emuHardware: HardwareItem[];
  onChanged: () => void;
};

function isPc(label: string): boolean {
  return /pc|windows|steam deck|steam_deck|mac|rog ally/i.test(label);
}

export function PlayedOnPicker({
  releaseId,
  selected,
  availableHardware,
  emuHardware,
  onChanged,
}: Props) {
  const [open, setOpen] = useState(false);
  const [emuExpanded, setEmuExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  const selectedIds = new Set(selected.map((s) => s.hardware_id));

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  async function add(hardwareId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/portfolio/played-on/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_id: releaseId, hardware_id: hardwareId, source: "manual" }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed");
      onChanged();
      window.dispatchEvent(new CustomEvent("played-on-updated", { detail: { releaseId } }));
    } catch (e: any) {
      console.error("[PlayedOnPicker] add failed:", e?.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(hardwareId: string) {
    setSaving(true);
    try {
      const res = await fetch("/api/portfolio/played-on/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_id: releaseId, hardware_id: hardwareId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed");
      onChanged();
      window.dispatchEvent(new CustomEvent("played-on-updated", { detail: { releaseId } }));
    } catch (e: any) {
      console.error("[PlayedOnPicker] remove failed:", e?.message);
    } finally {
      setSaving(false);
    }
  }

  async function clear() {
    setSaving(true);
    try {
      const res = await fetch("/api/portfolio/played-on/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ release_id: releaseId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed");
      setOpen(false);
      onChanged();
      window.dispatchEvent(new CustomEvent("played-on-updated", { detail: { releaseId } }));
    } catch (e: any) {
      console.error("[PlayedOnPicker] clear failed:", e?.message);
    } finally {
      setSaving(false);
    }
  }

  function toggle(h: HardwareItem) {
    if (selectedIds.has(h.hardware_id)) remove(h.hardware_id);
    else add(h.hardware_id);
  }

  return (
    <div className="space-y-2" ref={ref}>
      <div className="text-xs text-[#A8B0BF] uppercase tracking-wide">Played On</div>

      {/* Selected chips (collapsed state) */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((s) => {
            const label = s.label ?? "Unknown";
            const Icon = isPc(label) ? MonitorPlay : Gamepad2;
            return (
              <div
                key={s.hardware_id}
                className={`${chipClass} ${chipClassAccent}`}
              >
                <Icon size={14} className="shrink-0 opacity-90" />
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Change link */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-[#A8B0BF] hover:text-[#F1F5F9] hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors underline underline-offset-2 rounded px-1 -mx-1"
      >
        {open ? "Done" : selected.length ? "+ Add / Change" : "+ Add the system you played this on"}
      </button>

      {/* Picker (expanded state) */}
      {open && (
        <div className="mt-4 p-4 rounded-xl bg-[#1A1F29] border border-[#222833] space-y-4">
          {/* Section A: Official platforms */}
          <div>
            <div className="text-xs text-[#A8B0BF] uppercase tracking-wide mb-2">
              Official platforms
            </div>
            <div className="flex flex-wrap gap-2">
              {availableHardware.map((h) => {
                const label = h.label ?? "Unknown";
                const Icon = isPc(label) ? MonitorPlay : Gamepad2;
                const sel = selectedIds.has(h.hardware_id);
                return (
                  <button
                    key={h.hardware_id}
                    type="button"
                    disabled={saving}
                    onClick={() => toggle(h)}
                    className={`${chipClass} ${sel ? chipClassAccent : ""} ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <Icon size={14} className="shrink-0 opacity-90" />
                    <span>{label}</span>
                  </button>
                );
              })}
              {availableHardware.length === 0 && (
                <div className="text-sm text-[#A8B0BF]">No official platforms for this release.</div>
              )}
            </div>
          </div>

          {/* Section B: Emulated on (accordion) */}
          {emuHardware.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setEmuExpanded((v) => !v)}
                className="flex items-center gap-2 text-xs text-[#A8B0BF] uppercase tracking-wide mb-2 hover:text-[#F1F5F9] hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors rounded px-1 py-1 -mx-1 -my-1"
              >
                Emulated on
                <ChevronDown
                  size={14}
                  className={`transition-transform ${emuExpanded ? "rotate-180" : ""}`}
                />
              </button>
              {emuExpanded && (
                <div className="flex flex-wrap gap-2">
                  {emuHardware.map((h) => {
                    const label = h.label ?? "Unknown";
                    const Icon = isPc(label) ? MonitorPlay : Gamepad2;
                    const sel = selectedIds.has(h.hardware_id);
                    return (
                      <button
                        key={h.hardware_id}
                        type="button"
                        disabled={saving}
                        onClick={() => toggle(h)}
                        className={`${chipClass} ${sel ? chipClassAccent : ""} ${saving ? "opacity-60 cursor-not-allowed" : ""}`}
                      >
                        <Icon size={14} className="shrink-0 opacity-90" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Clear button */}
          {selected.length > 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={clear}
              className="text-sm text-[#A8B0BF] hover:text-[#EF4444] hover:bg-white/5 active:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2B84B]/40 focus-visible:ring-offset-0 transition-colors underline underline-offset-2 rounded px-1 -mx-1"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
