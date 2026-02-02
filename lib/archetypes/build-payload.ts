/**
 * Build ArchetypesPayload from UserStats (for snapshot storage and GET response).
 * Uses computeArchetypes(stats) and maps to the stable API shape.
 */

import type { UserStats } from "@/lib/insights/user-stats";
import { computeArchetypes, type ArchetypeScore } from "@/lib/archetypes/score";
import type {
  ArchetypesPayload,
  ArchetypeSignalItem,
  ArchetypeEvolutionItem,
} from "@/lib/archetypes/insights-types";

/** Result shape from computeArchetypes(stats) */
export type ComputeArchetypesResult = ReturnType<typeof computeArchetypes>;

function reasonToSignalItem(r: { label: string; value: string; confidence: "high" | "med" | "low" }): ArchetypeSignalItem {
  let value: number;
  const s = String(r.value).replace(/[^0-9.]/g, "");
  value = s ? parseFloat(s) : 0;
  if (String(r.value).includes("%") && value > 0 && value <= 100) value = value / 100;
  const confidence: "high" | "medium" | "low" = r.confidence === "med" ? "medium" : r.confidence;
  return {
    key: r.label.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "") || "signal",
    value,
    confidence,
  };
}

/**
 * Map computeArchetypes result to the stable API payload (for GET when reading new snapshot shape).
 */
export function buildPayloadFromArchetypes(archetypes: ComputeArchetypesResult): ArchetypesPayload {
  const primary = archetypes.primary_archetype ?? "completionist";
  const secondary = archetypes.top
    .slice(1, 3)
    .map((x) => x.key);

  const strength: Record<string, "emerging" | "strong" | "core"> = {};
  const signals: Record<string, ArchetypeSignalItem[]> = {};

  for (const a of archetypes.all) {
    if (a.tier) strength[a.key] = a.tier;
    if (a.reasons.length)
      signals[a.key] = a.reasons.map(reasonToSignalItem);
  }

  return {
    primary,
    secondary,
    strength,
    signals,
    evolution: [],
  };
}

/**
 * Build the stable API payload from stats.
 * Primary = top eligible archetype; secondary = next 2; strength/signals from computed scores.
 */
export function buildArchetypesPayload(stats: UserStats): ArchetypesPayload {
  const result = computeArchetypes(stats);
  return buildPayloadFromArchetypes(result);
}
