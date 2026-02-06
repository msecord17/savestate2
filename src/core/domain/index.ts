/**
 * Domain logic: archetype scoring, era scoring, insight generation, merge rules.
 * Re-exports from lib for single entry point. Core must never import UI.
 */

export {
  computeArchetypes,
  scoreCompletionist,
  scoreExplorer,
  scoreRetroDabbler,
  scoreEraIdentity,
  type ArchetypeScore,
  type StrengthTier,
} from "@/lib/archetypes/score";

export { buildPayloadFromArchetypes, buildArchetypesPayload } from "@/lib/archetypes/build-payload";
export type { ComputeArchetypesResult } from "@/lib/archetypes/build-payload";

export { getArchetypeCatalogEntry, getArchetypeColorToken, ARCHETYPE_CATALOG } from "@/lib/archetypes/catalog";
export type { ArchetypeCatalogEntry } from "@/lib/archetypes/catalog";

export { composeInsight, computeDeltas } from "@/lib/insights/compose-insight";
export type { SnapshotDeltas, ComposedInsight } from "@/lib/insights/compose-insight";

export { getUserStats, getCompletionRate } from "@/lib/insights/user-stats";
export type { UserStats, EraKey } from "@/lib/insights/user-stats";
