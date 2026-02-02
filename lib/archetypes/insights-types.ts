/**
 * Stable shape for GET /api/insights/archetypes.
 * UI consumes this; backend can swap mock for real scoring later.
 */

export type ArchetypeSignalItem = {
  key: string;
  value: number;
  confidence: "high" | "medium" | "low";
};

export type ArchetypeEvolutionItem = {
  from: string;
  to: string;
  window: string;
};

export type ArchetypesPayload = {
  primary: string;
  secondary: string[];
  strength: Record<string, "emerging" | "strong" | "core">;
  signals: Record<string, ArchetypeSignalItem[]>;
  evolution: ArchetypeEvolutionItem[];
};

/** Snapshot row as stored in user_archetype_snapshots (computed_at for staleness). */
export type UserArchetypeSnapshotRow = {
  user_id: string;
  version: string;
  payload: ArchetypesPayload;
  computed_at: string;
};
