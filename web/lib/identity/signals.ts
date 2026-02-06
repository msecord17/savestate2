import type { ArchetypeDetail, IdentitySignal } from "@/lib/identity/types";

// You can tune these keys later; keep them stable so UI is predictable.
export type SignalKey =
  | "play_evidence"
  | "completion"
  | "era_breadth"
  | "platform_diversity"
  | "curation"
  | "ownership";

export type Signal = {
  key: SignalKey;
  label: string;
  value: number; // 0..1
  note?: string;
};

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Build the Top Signals row from the computed identity payload.
 * If you already compute richer signals per archetype, just map them into this shape.
 */
export function buildTopSignals(input: {
  // These can come from your computed identity JSON.
  playEvidence?: number; // 0..1
  completion?: number; // 0..1
  eraBreadth?: number; // 0..1
  platformDiversity?: number; // 0..1
  curation?: number; // 0..1
  ownership?: number; // 0..1
}): Signal[] {
  const all: Signal[] = [
    {
      key: "play_evidence",
      label: "Play Evidence",
      value: clamp01(input.playEvidence ?? 0),
      note: "Trophies / Achievements / play",
    },
    {
      key: "completion",
      label: "Completion",
      value: clamp01(input.completion ?? 0),
      note: "Finished / mastery tendency",
    },
    {
      key: "era_breadth",
      label: "Era Breadth",
      value: clamp01(input.eraBreadth ?? 0),
      note: "How wide your timeline spans",
    },
    {
      key: "platform_diversity",
      label: "Platform Mix",
      value: clamp01(input.platformDiversity ?? 0),
      note: "How many ecosystems",
    },
    {
      key: "curation",
      label: "Curation",
      value: clamp01(input.curation ?? 0),
      note: "Lists / tags / ratings",
    },
    {
      key: "ownership",
      label: "Ownership",
      value: clamp01(input.ownership ?? 0),
      note: "Collector signal strength",
    },
  ];

  // Hide ownership unless it's meaningful (avoid confusing non-collectors)
  const filtered = all.filter((s) => s.key !== "ownership" || s.value >= 0.15);

  return filtered.sort((a, b) => b.value - a.value);
}

/** Map SignalKey to IdentitySignal.source for drawer compatibility. */
function sourceForKey(key: SignalKey): IdentitySignal["source"] {
  if (key === "ownership" || key === "curation") return key;
  if (key === "play_evidence" || key === "completion") return "play";
  if (key === "era_breadth") return "time";
  if (key === "platform_diversity") return "time";
  return "play";
}

/**
 * Optional: convert Top Signals into the drawer format if you want to reuse UI.
 */
export function topSignalsToDrawerDetail(
  signals: Signal[]
): Pick<ArchetypeDetail, "signals"> {
  return {
    signals: signals.map((s) => ({
      key: s.key,
      label: s.label,
      value: s.value,
      source: sourceForKey(s.key),
      note: s.note,
    })),
  };
}
