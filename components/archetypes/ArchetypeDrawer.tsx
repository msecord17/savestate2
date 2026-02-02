"use client";

import { useState } from "react";
import {
  getArchetypeFixture,
  getArchetypeDetail,
} from "@/lib/archetypes/fixtures";
import type { ArchetypeScore } from "@/lib/archetypes/score";
import type { ArchetypesPayload, ArchetypeSignalItem } from "@/lib/archetypes/insights-types";

/** Tier label mapping: emerging → Emerging, strong → Strong, core → Core */
const STRENGTH_LABELS: Record<"emerging" | "strong" | "core", string> = {
  emerging: "Emerging",
  strong: "Strong",
  core: "Core",
};

const DATA_SOURCES = [
  { key: "psn", label: "PSN" },
  { key: "steam", label: "Steam" },
  { key: "xbox", label: "Xbox" },
  { key: "ra", label: "RA" },
] as const;

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
  context_only: "Context only",
};

/** Human-readable label for API signal keys (from scorer reasons) */
function signalKeyLabel(key: string): string {
  const labels: Record<string, string> = {
    trophies: "Trophies & achievements",
    completion_rate: "Completion rate",
    era_concentration: "Era concentration",
    owned_titles: "Owned titles",
    lists_count: "Lists",
    tagged_titles: "Tagged titles",
    trophies_earned: "Trophies earned",
    ra_achievements_earned: "RA achievements earned",
    total_playtime: "Total playtime",
    platform_diversity: "Platform diversity",
    era_diversity: "Era diversity",
    library_size: "Library size",
    retro_share: "Retro share",
    ra_interest: "RA interest",
    retro_library_size: "Retro library size",
    ps2_era_share: "PS2-era share",
    ps2_era_library_size: "PS2-era library size",
    ps2era_share: "PS2-era share",
    ps2era_library_size: "PS2-era library size",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function formatSignalValue(value: number, key: string): string {
  const percentKeys = ["completion_rate", "era_concentration", "retro_share", "ps2era_share"];
  if (percentKeys.includes(key) && value <= 1 && value >= 0) {
    return `${Math.round(value * 100)}%`;
  }
  return value.toLocaleString();
}

export type ArchetypeDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  archetypeKey: string | null;
  /** payload.archetypes.top — primary content source: tier + reasons. */
  archetypesTop?: ArchetypeScore[];
  /** Mapped payload for signals by key (fallback when archetypesTop missing). */
  archetypePayload?: ArchetypesPayload | null;
  strengthTier?: "emerging" | "strong" | "core";
  evolutionTags?: string[];
};

/**
 * Archetype Detail Drawer — key-driven. Reads fixture by archetypeKey, renders
 * name, header, why, signals, strength tier copy, guardrail, and Evolution stub.
 */
export function ArchetypeDrawer({
  open,
  onOpenChange,
  archetypeKey,
  archetypesTop = [],
  archetypePayload,
  strengthTier = "strong",
  evolutionTags,
}: ArchetypeDrawerProps) {
  const [whyExpanded, setWhyExpanded] = useState(false);
  const selectedArchetype = archetypeKey
    ? archetypesTop.find((a) => a.key === archetypeKey)
    : null;
  const fixture = archetypeKey ? getArchetypeFixture(archetypeKey) : null;
  const effectiveTierForDetail =
    (selectedArchetype?.tier ?? archetypePayload?.strength?.[archetypeKey ?? ""] ?? strengthTier) as "emerging" | "strong" | "core";
  const detail = fixture && archetypeKey
    ? getArchetypeDetail(archetypeKey, effectiveTierForDetail)
    : null;

  // Reasons from payload.archetypes.top (primary) or from mapped archetypePayload.signals (fallback)
  const reasonsFromTop = selectedArchetype?.reasons ?? [];
  const yourSignals: ArchetypeSignalItem[] =
    reasonsFromTop.length > 0
      ? reasonsFromTop.map((r) => ({
          key: r.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "signal",
          value: 0,
          confidence: (r.confidence === "med" ? "medium" : r.confidence) as "high" | "medium" | "low",
        }))
      : archetypeKey && archetypePayload?.signals
        ? archetypePayload.signals[archetypeKey] ?? []
        : [];

  const evolution = archetypePayload?.evolution ?? [];
  const hasEvolution = evolution.length > 0 || (evolutionTags && evolutionTags.length > 0);

  const displayName = selectedArchetype?.name ?? fixture?.name ?? archetypeKey ?? "";
  const tierLabel = selectedArchetype?.tier ? STRENGTH_LABELS[selectedArchetype.tier] : STRENGTH_LABELS[effectiveTierForDetail];

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        aria-hidden
        onClick={() => onOpenChange(false)}
      />
      <aside
        className="fixed z-50 flex flex-col bg-zinc-900 shadow-xl md:right-0 md:top-0 md:h-full md:w-full md:max-w-md md:rounded-none md:border-l md:border-white/10 bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl border-t border-white/10"
        role="dialog"
        aria-label="Archetype details"
      >
        <div className="flex flex-1 flex-col overflow-y-auto">
          {(selectedArchetype || (fixture && detail)) ? (
            <>
              {/* Header: name + tier pill (Emerging/Strong/Core) from payload.archetypes.top */}
              <div className="border-b border-white/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl" aria-hidden>
                    {fixture?.icon ?? "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-white">
                        {displayName}
                      </h2>
                      <span
                        className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-zinc-900"
                        style={{
                          backgroundColor:
                            effectiveTierForDetail === "core"
                              ? "#a5f3fc"
                              : effectiveTierForDetail === "strong"
                              ? "#bae6fd"
                              : "#e0e7ff",
                        }}
                      >
                        {tierLabel}
                      </span>
                    </div>
                    {fixture?.header && (
                      <p className="mt-2 text-sm text-zinc-400">
                        {fixture.header}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenChange(false)}
                    className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Why this fits you — fixture explanation layer (when fixture exists) */}
              {fixture?.why && (
                <div className="border-b border-white/10 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Why this fits you
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-300">
                    {fixture.why}
                  </p>
                </div>
              )}

              {/* Your signals / Reasons — from payload.archetypes.top */}
              {(reasonsFromTop.length > 0 || yourSignals.length > 0) && (
                <div className="border-b border-white/10 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Your signals
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {reasonsFromTop.length > 0
                      ? reasonsFromTop.map((r, i) => (
                          <li key={i} className="flex gap-3 text-sm">
                            <span className="text-zinc-500">
                              {CONFIDENCE_LABELS[r.confidence === "med" ? "medium" : r.confidence] ?? r.confidence}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-zinc-300">
                                {r.label}: <span className="text-white">{r.value}</span>
                              </p>
                            </div>
                          </li>
                        ))
                      : yourSignals.map((sig) => (
                          <li key={sig.key} className="flex gap-3 text-sm">
                            <span className="text-zinc-500">
                              {CONFIDENCE_LABELS[sig.confidence] ?? sig.confidence}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-zinc-300">
                                {signalKeyLabel(sig.key)}:{" "}
                                <span className="text-white">
                                  {formatSignalValue(sig.value, sig.key)}
                                </span>
                              </p>
                            </div>
                          </li>
                        ))}
                  </ul>
                </div>
              )}

              {/* Why we think this — collapsible reasons list */}
              {(reasonsFromTop.length > 0 || yourSignals.length > 0) && (
                <div className="border-b border-white/10 p-4">
                  <button
                    type="button"
                    onClick={() => setWhyExpanded((e) => !e)}
                    className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-400"
                  >
                    Why we think this
                    <span aria-hidden>{whyExpanded ? "−" : "+"}</span>
                  </button>
                  {whyExpanded && (
                    <ul className="mt-3 space-y-2">
                      {reasonsFromTop.length > 0
                        ? reasonsFromTop.map((r, i) => (
                            <li key={i} className="text-sm text-zinc-400">
                              {r.label}: {r.value}
                              <span className="ml-1.5 text-zinc-500">
                                ({CONFIDENCE_LABELS[r.confidence === "med" ? "medium" : r.confidence] ?? r.confidence})
                              </span>
                            </li>
                          ))
                        : yourSignals.map((sig) => (
                            <li key={sig.key} className="text-sm text-zinc-400">
                              {signalKeyLabel(sig.key)}: {formatSignalValue(sig.value, sig.key)}
                              <span className="ml-1.5 text-zinc-500">
                                ({CONFIDENCE_LABELS[sig.confidence] ?? sig.confidence})
                              </span>
                            </li>
                          ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Signals used — fixture copy (explanation, when fixture exists) */}
              {fixture?.signals?.length > 0 && (
                <div className="border-b border-white/10 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Signals used
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {fixture.signals.map((sig, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="text-zinc-500">
                          {CONFIDENCE_LABELS[sig.confidence] ?? sig.confidence}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-zinc-300">{sig.label}</p>
                          <p className="mt-0.5 text-xs text-zinc-500">
                            {sig.copy}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Strength tier copy (fixture when present) */}
              {fixture?.strength_tiers?.[effectiveTierForDetail] && (
                <div className="border-b border-white/10 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Your strength
                  </h3>
                  <p className="mt-2 text-sm text-zinc-300">
                    {fixture.strength_tiers[effectiveTierForDetail]}
                  </p>
                </div>
              )}

              {/* Guardrail when present */}
              {fixture?.guardrail_note && (
                <div className="border-b border-white/10 p-4">
                  <p className="text-xs text-zinc-500">
                    {fixture.guardrail_note}
                  </p>
                </div>
              )}

              {/* Evolution — optional; empty safely */}
              {hasEvolution && (
                <div className="border-b border-white/10 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Evolution
                  </h3>
                  {evolution.length > 0 ? (
                    <ul className="mt-3 space-y-2">
                      {evolution.map((ev, i) => (
                        <li key={i} className="text-sm text-zinc-400">
                          {ev.from} → {ev.to} ({ev.window})
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-400">
                      We&apos;ll show how your style shifts over time once you have
                      enough history.
                    </p>
                  )}
                  {evolutionTags && evolutionTags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {evolutionTags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs text-zinc-300"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Data sources — PSN / Steam / Xbox / RA badges */}
              <div className="border-b border-white/10 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Data sources
                </h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {DATA_SOURCES.map(({ key, label }) => (
                    <span
                      key={key}
                      className="rounded-md border border-white/20 bg-white/5 px-2.5 py-1 text-xs font-medium text-zinc-300"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>

              {/* Footer note */}
              <div className="p-4">
                <p className="text-xs text-zinc-600">
                  These insights are based on your play history, connected
                  platforms, and optional collection data. Ownership and play
                  are treated separately.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-zinc-500">
              Select an archetype to view details.
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
