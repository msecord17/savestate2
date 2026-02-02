/**
 * Compose headline/subline/compact_tag from primary era, primary archetype, and deltas.
 * Compute deltas from latest + previous snapshot. Used by GameHome Identity strip.
 */

import type { EraKey } from "@/lib/insights/user-stats";
import { getCompletionRate } from "@/lib/insights/user-stats";
import { getArchetypeCatalogEntry } from "@/lib/archetypes/catalog";
import type { SnapshotPayload } from "@/lib/insights/recompute";

export type SnapshotDeltas = {
  completionRateDelta?: number;
  playtimeDeltaMinutes?: number;
  primaryEraChanged?: boolean;
  primaryEraFrom?: EraKey | null;
  primaryEraTo?: EraKey | null;
  primaryArchetypeChanged?: boolean;
  primaryArchetypeFrom?: string | null;
  primaryArchetypeTo?: string | null;
};

export type ComposedInsight = {
  headline: string;
  subline: string;
  compact_tag: string;
};

const ERA_LABELS: Record<string, string> = {
  early: "Early home computing",
  nes: "NES era",
  snes: "SNES era",
  ps1: "PS1 era",
  ps2: "PS2 era",
  ps3_360: "PS3 / 360 era",
  wii: "Wii era",
  modern: "Modern",
  unknown: "Multiple eras",
};

export function composeInsight(
  primaryEra: EraKey | null,
  primaryArchetype: string | null,
  deltas: SnapshotDeltas | null
): ComposedInsight {
  const eraLabel = primaryEra ? ERA_LABELS[primaryEra] ?? primaryEra : "Your library";
  const catalogEntry = primaryArchetype ? getArchetypeCatalogEntry(primaryArchetype) : null;
  const archetypeLabel = catalogEntry?.label ?? primaryArchetype ?? "Your style";

  let headline = archetypeLabel;
  let subline = eraLabel;
  let compact_tag = "";

  if (deltas?.primaryArchetypeChanged && deltas.primaryArchetypeTo) {
    const toLabel = getArchetypeCatalogEntry(deltas.primaryArchetypeTo)?.label ?? deltas.primaryArchetypeTo;
    compact_tag = `→ ${toLabel}`;
  }
  if (deltas?.primaryEraChanged && deltas.primaryEraTo) {
    const toEra = ERA_LABELS[deltas.primaryEraTo] ?? deltas.primaryEraTo;
    if (compact_tag) compact_tag += ` · ${toEra}`;
    else compact_tag = `→ ${toEra}`;
  }
  if (deltas?.completionRateDelta != null && deltas.completionRateDelta > 0) {
    const pct = Math.round(deltas.completionRateDelta * 100);
    if (compact_tag) compact_tag += ` · +${pct}% completion`;
    else compact_tag = `+${pct}% completion`;
  }
  if (deltas?.playtimeDeltaMinutes != null && deltas.playtimeDeltaMinutes > 0) {
    const hours = Math.round(deltas.playtimeDeltaMinutes / 60);
    if (compact_tag) compact_tag += ` · +${hours}h play`;
    else compact_tag = `+${hours}h play`;
  }

  return {
    headline,
    subline,
    compact_tag: compact_tag || `${archetypeLabel} · ${eraLabel}`,
  };
}

/**
 * Compute deltas between latest and previous snapshot (completion, playtime, era, archetype).
 */
export function computeDeltas(
  latest: SnapshotPayload | null,
  previous: SnapshotPayload | null
): SnapshotDeltas | null {
  if (!latest || !previous) return null;

  const latestCompletion = getCompletionRate(latest.stats);
  const previousCompletion = getCompletionRate(previous.stats);
  const completionRateDelta = latestCompletion - previousCompletion;

  const playtimeDeltaMinutes =
    (latest.stats.totalPlaytimeMinutes ?? 0) - (previous.stats.totalPlaytimeMinutes ?? 0);

  const primaryEraTo = (latest.archetypes?.primary_era ?? null) as EraKey | null;
  const primaryEraFrom = (previous.archetypes?.primary_era ?? null) as EraKey | null;
  const primaryEraChanged = primaryEraTo !== primaryEraFrom;

  const primaryArchetypeTo = latest.archetypes?.primary_archetype ?? null;
  const primaryArchetypeFrom = previous.archetypes?.primary_archetype ?? null;
  const primaryArchetypeChanged = primaryArchetypeTo !== primaryArchetypeFrom;

  return {
    completionRateDelta: completionRateDelta !== 0 ? completionRateDelta : undefined,
    playtimeDeltaMinutes: playtimeDeltaMinutes !== 0 ? playtimeDeltaMinutes : undefined,
    primaryEraChanged: primaryEraChanged || undefined,
    primaryEraFrom: primaryEraChanged ? primaryEraFrom : undefined,
    primaryEraTo: primaryEraChanged ? primaryEraTo : undefined,
    primaryArchetypeChanged: primaryArchetypeChanged || undefined,
    primaryArchetypeFrom: primaryArchetypeChanged ? primaryArchetypeFrom : undefined,
    primaryArchetypeTo: primaryArchetypeChanged ? primaryArchetypeTo : undefined,
  };
}
