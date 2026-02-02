"use client";

import { useState } from "react";
import type { ArchetypeDetail, ArchetypeDetailSignal } from "@/lib/identity/types";
import { getArchetypeCatalogEntry } from "@/lib/archetypes/catalog";
import type { ArchetypeScore } from "@/lib/archetypes/score";

const STRENGTH_LABELS: Record<"emerging" | "strong" | "core", string> = {
  emerging: "Emerging",
  strong: "Strong",
  core: "Core",
};

const SIGNAL_STRENGTH_LABELS: Record<"low" | "medium" | "high", string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

function signalTypeHint(signal: ArchetypeDetailSignal): string | null {
  if (signal.type === "ownership" || signal.type === "curation")
    return "Context only";
  return null;
}

/** Props when using snapshot + catalog (GameHome, Identity strip). */
export type ArchetypeDetailDrawerSnapshotProps = {
  open: boolean;
  onClose: () => void;
  archetypeKey: string | null;
  /** payload.archetypes.top from GET insights */
  archetypesTop?: ArchetypeScore[];
  onSelectBlend?: (archetypeId: string) => void;
};

/** Legacy props when passing pre-built detail. */
export type ArchetypeDetailDrawerDetailProps = {
  open: boolean;
  detail: ArchetypeDetail | null;
  onClose: () => void;
  onSelectBlend?: (archetypeId: string) => void;
};

export type ArchetypeDetailDrawerProps =
  | (ArchetypeDetailDrawerSnapshotProps & { detail?: never })
  | (ArchetypeDetailDrawerDetailProps & { archetypeKey?: never; archetypesTop?: never });

/**
 * Archetype Detail Drawer — Header (name, tier badge, one-liner), Why you got this (reasons from snapshot),
 * Signals (from catalog), Evolution (placeholder). Chips open this.
 */
export function ArchetypeDetailDrawer(
  props: ArchetypeDetailDrawerProps
) {
  const { open, onClose, onSelectBlend } = props;
  const [strengthExpanded, setStrengthExpanded] = useState(false);

  const snapshotMode = "archetypeKey" in props && props.archetypeKey != null;
  const archetypeKey = snapshotMode ? (props as ArchetypeDetailDrawerSnapshotProps).archetypeKey : null;
  const archetypesTop = snapshotMode ? (props as ArchetypeDetailDrawerSnapshotProps).archetypesTop ?? [] : [];
  const detailLegacy = !snapshotMode ? (props as ArchetypeDetailDrawerDetailProps).detail : null;

  const catalogEntry = archetypeKey ? getArchetypeCatalogEntry(archetypeKey) : null;
  const selectedFromSnapshot = archetypeKey ? archetypesTop.find((a) => a.key === archetypeKey) : null;
  const tier = (selectedFromSnapshot?.tier ?? "strong") as "emerging" | "strong" | "core";
  const reasons = selectedFromSnapshot?.reasons ?? [];

  const displayName = selectedFromSnapshot?.name ?? catalogEntry?.label ?? archetypeKey ?? "";
  const oneLiner = catalogEntry?.one_liner ?? "";
  const tierCopy = catalogEntry?.tier_copy?.[tier];
  const icon = catalogEntry?.icon ?? "•";

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/50"
        aria-hidden
        onClick={onClose}
      />
      <aside
        className="fixed z-50 flex flex-col bg-zinc-900 shadow-xl md:right-0 md:top-0 md:h-full md:w-full md:max-w-md md:rounded-none md:border-l md:border-white/10 bottom-0 left-0 right-0 max-h-[85vh] rounded-t-2xl border-t border-white/10"
        role="dialog"
        aria-label="Archetype details"
      >
        <div className="flex flex-1 flex-col overflow-y-auto">
          {detailLegacy ? (
            <LegacyContent
              detail={detailLegacy}
              onClose={onClose}
              onSelectBlend={onSelectBlend}
              strengthExpanded={strengthExpanded}
              setStrengthExpanded={setStrengthExpanded}
            />
          ) : catalogEntry || displayName ? (
            <>
              {/* 1. Header: name, tier badge, one-liner */}
              <div className="border-b border-white/10 p-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl" aria-hidden>
                    {icon}
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
                            tier === "core"
                              ? "var(--archetype-tier-core)"
                              : tier === "strong"
                              ? "var(--archetype-tier-strong)"
                              : "var(--archetype-tier-emerging)",
                        }}
                      >
                        {STRENGTH_LABELS[tier]}
                      </span>
                    </div>
                    {oneLiner && (
                      <p className="mt-2 text-sm text-zinc-400">
                        {oneLiner}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-300"
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* 2. Why you got this — reasons[] from snapshot payload */}
              {reasons.length > 0 && (
                <div className="border-b border-white/10 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Why you got this
                  </h3>
                  <ul className="mt-3 space-y-2">
                    {reasons.map((r, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="text-zinc-500 shrink-0">
                          {SIGNAL_STRENGTH_LABELS[r.confidence === "med" ? "medium" : r.confidence]}
                        </span>
                        <span className="text-zinc-300">
                          {r.label}: <span className="text-white">{r.value}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 3. Signals — from catalog (fixtures) */}
              {catalogEntry?.signals && catalogEntry.signals.length > 0 && (
                <div className="border-b border-white/10 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Signals
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {catalogEntry.signals.map((sig, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="text-zinc-500 capitalize shrink-0">
                          {sig.verb}
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

              {/* 4. Tier copy (your strength) */}
              {tierCopy && (
                <div className="border-b border-white/10 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Your strength
                  </h3>
                  <p className="mt-2 text-sm text-zinc-300">{tierCopy}</p>
                </div>
              )}

              {/* 5. Evolution — placeholder */}
              <div className="border-b border-white/10 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Evolution
                </h3>
                <p className="mt-2 text-sm text-zinc-500">
                  We&apos;ll show how your style shifts over time once you have enough history.
                </p>
              </div>

              <div className="p-4">
                <p className="text-xs text-zinc-600">
                  These insights are based on your play history, connected
                  platforms, and optional collection data. Ownership and play are
                  treated separately.
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

function LegacyContent({
  detail,
  onClose,
  onSelectBlend,
  strengthExpanded,
  setStrengthExpanded,
}: {
  detail: ArchetypeDetail;
  onClose: () => void;
  onSelectBlend?: (archetypeId: string) => void;
  strengthExpanded: boolean;
  setStrengthExpanded: (v: boolean) => void;
}) {
  return (
    <>
      <div className="border-b border-white/10 p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl" aria-hidden>{detail.icon}</span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white">{detail.name}</h2>
            <p className="mt-0.5 text-xs font-medium text-zinc-500">
              {STRENGTH_LABELS[detail.strengthTier]} archetype
            </p>
            {detail.subtext && (
              <p className="mt-2 text-sm text-zinc-400">{detail.subtext}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-zinc-300" aria-label="Close">×</button>
        </div>
      </div>
      {detail.description && (
        <div className="border-b border-white/10 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Why this fits you</h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-300">{detail.description}</p>
        </div>
      )}
      {detail.signals?.length > 0 && (
        <div className="border-b border-white/10 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Signals used</h3>
          <ul className="mt-3 space-y-3">
            {detail.signals.map((sig, i) => {
              const hint = signalTypeHint(sig);
              return (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="text-zinc-500">{SIGNAL_STRENGTH_LABELS[sig.strength]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-zinc-300">
                      {sig.label}
                      {hint && <span className="ml-1.5 text-xs text-zinc-500">— {hint}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">{sig.note}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <div className="border-b border-white/10 p-4">
        <button
          type="button"
          onClick={() => setStrengthExpanded((e) => !e)}
          className="flex w-full items-center justify-between text-left text-xs font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-400"
        >
          Strength breakdown
          <span aria-hidden>{strengthExpanded ? "−" : "+"}</span>
        </button>
        {strengthExpanded && (
          <p className="mt-2 text-xs text-zinc-500">
            Relative bars and labels — data can be wired here later.
          </p>
        )}
      </div>
      {detail.evolution?.length > 0 && (
        <div className="border-b border-white/10 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Your evolution</h3>
          <ul className="mt-3 space-y-3">
            {detail.evolution.map((ev, i) => (
              <li key={i} className="border-l-2 border-white/10 pl-3">
                <p className="text-xs font-medium text-zinc-400">{ev.era} — {ev.archetype}</p>
                <p className="mt-0.5 text-sm text-zinc-300">{ev.insight}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {detail.blends?.length > 0 && (
        <div className="border-b border-white/10 p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Often paired with</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {detail.blends.map((blendId) => (
              <button
                key={blendId}
                type="button"
                onClick={() => onSelectBlend?.(blendId)}
                className="rounded-full bg-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/15"
              >
                {blendId}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="p-4">
        <p className="text-xs text-zinc-600">
          These insights are based on your play history, connected platforms, and optional collection data. Ownership and play are treated separately.
        </p>
      </div>
    </>
  );
}
