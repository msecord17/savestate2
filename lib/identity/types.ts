/**
 * Identity payload — backend contract.
 * Single endpoint returns this. Everything else (GamerIdentityCard, InsightRail, EraStrip) flows from here.
 */

export type IdentityPayload = {
  primary_archetype: {
    id: string;
    name: string;
    confidence: "core" | "strong" | "emerging";
  };

  era_anchor: {
    id: string;
    label: string;
  };

  insights: Array<{
    id: string;
    type: "era" | "archetype" | "blend" | "transition" | "collector";
    copy: string;
    confidence: "high" | "medium";
  }>;

  eras: Array<{
    id: string;
    label: string;
    cultural_line: string;
    personal_line: string;
  }>;
};

// --- Archetype Detail Drawer (observations with provenance) ---

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

export type ArchetypeDetail = {
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

// --- Archetype drawer fixtures (JSON) ---

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
