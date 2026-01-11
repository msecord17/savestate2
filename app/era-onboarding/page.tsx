"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type EraKey =
  | "nes" | "snes" | "n64" | "gc" | "wii"
  | "genesis" | "saturn" | "dreamcast"
  | "ps1" | "ps2" | "ps3" | "ps4" | "ps5"
  | "xbox" | "x360" | "xone" | "xsx"
  | "pc_90s" | "pc_00s" | "pc_modern"
  | "handheld_gb" | "handheld_gba" | "handheld_ds" | "handheld_psp" | "handheld_modern";

type EraEntry = {
  key: EraKey;
  label: string;
  fromYear: number;
  toYear: number;
  intensity: "dabble" | "regular" | "obsessed";
};

const ERA_OPTIONS: { key: EraKey; label: string; hint: string; defaultFrom: number; defaultTo: number }[] = [
  { key: "nes", label: "NES", hint: "cartridges + blown dust rituals", defaultFrom: 1987, defaultTo: 1992 },
  { key: "snes", label: "SNES", hint: "16-bit greatness", defaultFrom: 1991, defaultTo: 1997 },
  { key: "genesis", label: "Genesis", hint: "blast processing (allegedly)", defaultFrom: 1991, defaultTo: 1997 },
  { key: "ps1", label: "PS1", hint: "CD cases + late-night RPG saves", defaultFrom: 1996, defaultTo: 2002 },
  { key: "n64", label: "N64", hint: "four controllers, one TV", defaultFrom: 1997, defaultTo: 2002 },
  { key: "ps2", label: "PS2", hint: "the back-catalog black hole", defaultFrom: 2001, defaultTo: 2009 },
  { key: "xbox", label: "Xbox", hint: "big box energy", defaultFrom: 2002, defaultTo: 2006 },
  { key: "x360", label: "Xbox 360", hint: "party chat era begins", defaultFrom: 2006, defaultTo: 2013 },
  { key: "ps3", label: "PS3", hint: "HDMI + trophies arrive", defaultFrom: 2007, defaultTo: 2013 },
  { key: "ps4", label: "PS4", hint: "the backlog grows stronger", defaultFrom: 2014, defaultTo: 2020 },
  { key: "xone", label: "Xbox One", hint: "game pass gravity", defaultFrom: 2014, defaultTo: 2020 },
  { key: "ps5", label: "PS5", hint: "current era", defaultFrom: 2020, defaultTo: new Date().getFullYear() },
  { key: "xsx", label: "Series X|S", hint: "current era", defaultFrom: 2020, defaultTo: new Date().getFullYear() },
  { key: "pc_90s", label: "PC (90s)", hint: "shareware + LAN", defaultFrom: 1993, defaultTo: 2000 },
  { key: "pc_00s", label: "PC (00s)", hint: "Steam awakens", defaultFrom: 2000, defaultTo: 2013 },
  { key: "pc_modern", label: "PC (modern)", hint: "library is infinite", defaultFrom: 2013, defaultTo: new Date().getFullYear() },
  { key: "handheld_gb", label: "Game Boy", hint: "batteries not included", defaultFrom: 1990, defaultTo: 1998 },
  { key: "handheld_gba", label: "GBA", hint: "SP clamshell supremacy", defaultFrom: 2002, defaultTo: 2008 },
  { key: "handheld_ds", label: "DS/3DS", hint: "stylus era", defaultFrom: 2005, defaultTo: 2016 },
  { key: "handheld_psp", label: "PSP/Vita", hint: "handheld glow-up", defaultFrom: 2006, defaultTo: 2015 },
  { key: "handheld_modern", label: "Modern handhelds", hint: "Switch/Deck/etc.", defaultFrom: 2017, defaultTo: new Date().getFullYear() },
];

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export default function EraOnboardingPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [entries, setEntries] = useState<Record<string, EraEntry>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<{ points: number; confidence: number } | null>(null);

  useEffect(() => {
    // load existing
    fetch("/api/eras")
      .then((r) => r.json())
      .then((d) => {
        const eras = Array.isArray(d?.eras) ? d.eras : [];
        const sel: Record<string, boolean> = {};
        const map: Record<string, EraEntry> = {};
        for (const e of eras) {
          if (!e?.key) continue;
          sel[e.key] = true;
          map[e.key] = e;
        }
        setSelected(sel);
        setEntries(map);
      })
      .catch(() => {});
  }, []);

  const selectedKeys = useMemo(() => {
    return ERA_OPTIONS.filter((e) => selected[e.key]).map((e) => e.key);
  }, [selected]);

  function toggleEra(key: EraKey) {
    setSelected((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      return next;
    });

    setEntries((prev) => {
      // if enabling and missing entry, create defaults
      if (!prev[key]) {
        const opt = ERA_OPTIONS.find((x) => x.key === key)!;
        return {
          ...prev,
          [key]: {
            key,
            label: opt.label,
            fromYear: opt.defaultFrom,
            toYear: opt.defaultTo,
            intensity: "regular",
          },
        };
      }
      return prev;
    });
  }

  async function saveEras() {
    setSaving(true);
    setErr("");
    try {
      const eras = selectedKeys.map((k) => entries[k]).filter(Boolean);

      const res = await fetch("/api/eras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eras }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setPreview({ points: data?.era_bonus_points ?? 0, confidence: data?.confidence_bonus ?? 0 });
      setStep(3);
    } catch (e: any) {
      setErr(e?.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 4 }}>Era History</h1>
          <div style={{ color: "#64748b" }}>90 seconds. Feels like a personality quiz. Improves your Gamer Lifetime Score.</div>
        </div>
        <Link href="/profile" style={{ color: "#2563eb" }}>Back to Profile →</Link>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", color: "#64748b", fontSize: 13 }}>
        <span style={{ padding: "2px 8px", border: "1px solid #e5e7eb", borderRadius: 999, background: "white" }}>
          Step {step}/3
        </span>
        <span>•</span>
        <span>Pick eras → tune intensity → get the score bump</span>
      </div>

      {err && <div style={{ marginTop: 12, color: "#b91c1c" }}>{err}</div>}

      {step === 1 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Step 1: Which generations were you active in?</div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {ERA_OPTIONS.map((e) => {
              const on = !!selected[e.key];
              return (
                <button
                  key={e.key}
                  type="button"
                  onClick={() => toggleEra(e.key)}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderRadius: 14,
                    border: on ? "2px solid #2563eb" : "1px solid #e5e7eb",
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{e.label}</div>
                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>{e.hint}</div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={selectedKeys.length === 0}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: selectedKeys.length === 0 ? "#f1f5f9" : "white",
                cursor: selectedKeys.length === 0 ? "not-allowed" : "pointer",
                fontWeight: 900,
              }}
            >
              Next →
            </button>
            <div style={{ color: "#64748b", alignSelf: "center", fontSize: 13 }}>
              Selected: {selectedKeys.length}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Step 2: For each selected era, set years + intensity</div>

          <div style={{ display: "grid", gap: 12 }}>
            {selectedKeys.map((k) => {
              const e = entries[k];
              const minY = 1970;
              const maxY = new Date().getFullYear();

              return (
                <div
                  key={k}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    background: "white",
                    padding: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontWeight: 900 }}>{e.label}</div>
                    <button
                      type="button"
                      onClick={() => toggleEra(k)}
                      style={{ border: "none", background: "transparent", color: "#b91c1c", cursor: "pointer", fontWeight: 800 }}
                    >
                      remove
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                    <div>
                      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>From</div>
                      <input
                        type="number"
                        value={e.fromYear}
                        min={minY}
                        max={maxY}
                        onChange={(ev) => {
                          const v = clamp(Number(ev.target.value || e.fromYear), minY, maxY);
                          setEntries((prev) => ({ ...prev, [k]: { ...prev[k], fromYear: v, toYear: Math.max(v, prev[k].toYear) } }));
                        }}
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                      />
                    </div>

                    <div>
                      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>To</div>
                      <input
                        type="number"
                        value={e.toYear}
                        min={minY}
                        max={maxY}
                        onChange={(ev) => {
                          const v = clamp(Number(ev.target.value || e.toYear), minY, maxY);
                          setEntries((prev) => ({ ...prev, [k]: { ...prev[k], toYear: Math.max(prev[k].fromYear, v) } }));
                        }}
                        style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #e5e7eb" }}
                      />
                    </div>

                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>Intensity</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {[
                          { key: "dabble", label: "Dabbled", copy: "a few classics, vibes only" },
                          { key: "regular", label: "Regular", copy: "you had favorites, you showed up" },
                          { key: "obsessed", label: "Obsessed", copy: "you knew release dates and secrets" },
                        ].map((opt) => {
                          const on = e.intensity === (opt.key as any);
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => setEntries((prev) => ({ ...prev, [k]: { ...prev[k], intensity: opt.key as any } }))}
                              style={{
                                textAlign: "left",
                                padding: "8px 10px",
                                borderRadius: 12,
                                border: on ? "2px solid #7c3aed" : "1px solid #e5e7eb",
                                background: "white",
                                cursor: "pointer",
                              }}
                            >
                              <div style={{ fontWeight: 900, fontSize: 13 }}>{opt.label}</div>
                              <div style={{ color: "#64748b", fontSize: 12 }}>{opt.copy}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => setStep(1)}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "white",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              ← Back
            </button>

            <button
              type="button"
              onClick={saveEras}
              disabled={saving}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "white",
                cursor: "pointer",
                fontWeight: 900,
              }}
            >
              {saving ? "Saving…" : "Finish →"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Step 3: Instant bump + confidence change</div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: 14, background: "white" }}>
            <div style={{ fontSize: 18, fontWeight: 900 }}>
              Era bonus unlocked ✅
            </div>
            <div style={{ color: "#64748b", marginTop: 6 }}>
              Your era history adds “lifetime lore” to your score — and boosts confidence because your data coverage is wider.
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, minWidth: 220 }}>
                <div style={{ color: "#64748b", fontSize: 12 }}>Era bonus points</div>
                <div style={{ fontSize: 26, fontWeight: 900 }}>{preview?.points ?? 0}</div>
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, minWidth: 220 }}>
                <div style={{ color: "#64748b", fontSize: 12 }}>Confidence bonus</div>
                <div style={{ fontSize: 26, fontWeight: 900 }}>+{preview?.confidence ?? 0}</div>
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
              <Link href="/profile" style={{ color: "#2563eb", fontWeight: 900 }}>
                Back to Profile →
              </Link>
              <Link href="/profile#score" style={{ color: "#7c3aed", fontWeight: 900 }}>
                See my score breakdown →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
