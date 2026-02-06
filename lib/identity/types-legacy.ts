/**
 * Legacy identity/drawer types. Used by fixture pipeline and ArchetypeDetailDrawer until migrated to types.ts contract.
 * @see lib/identity/types.ts for the canonical UI contract.
 */

export type ArchetypeDetailSignal = {
  type: "play" | "ownership" | "time" | "curation";
  label: string;
  strength: "low" | "medium" | "high";
  note: string;
};

export type ArchetypeDetailEvolution = {
  era: string;
  archetype: string;
  insight: string;
};

export type ArchetypeDetailLegacy = {
  id: string;
  name: string;
  icon: string;
  strengthTier: "emerging" | "strong" | "core";
  description: string;
  subtext?: string;
  signals: ArchetypeDetailSignal[];
  evolution: ArchetypeDetailEvolution[];
  blends?: string[];
};

export type ArchetypeFixtureSignal = {
  label: string;
  confidence: "high" | "medium" | "low" | "context_only";
  copy: string;
};

export type ArchetypeFixture = {
  key: string;
  name: string;
  category: "play" | "collector" | "hybrid";
  icon: string;
  header: string;
  why: string;
  signals: ArchetypeFixtureSignal[];
  strength_tiers: {
    emerging: string;
    strong: string;
    core: string;
  };
  guardrail_note?: string;
};

export type ArchetypeDrawerFixtures = {
  version: string;
  drawer_footer_note: string;
  archetypes: ArchetypeFixture[];
};
