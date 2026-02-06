import type {
  ArchetypeDetailLegacy,
  ArchetypeDetailSignal,
  ArchetypeFixture,
  ArchetypeDrawerFixtures,
} from "./types-legacy";

import fixturesJson from "./archetype-drawer-fixtures.json";

const fixtures = fixturesJson as ArchetypeDrawerFixtures;

export { fixtures };
export const drawerFooterNote = fixtures.drawer_footer_note;
export const archetypeFixtures = fixtures.archetypes;

export function getArchetypeFixture(key: string): ArchetypeFixture | undefined {
  return fixtures.archetypes.find((a) => a.key === key);
}

function confidenceToStrength(
  c: "high" | "medium" | "low" | "context_only"
): "low" | "medium" | "high" {
  if (c === "context_only") return "low";
  return c;
}

function signalTypeFromLabel(label: string): "play" | "ownership" | "time" | "curation" {
  const lower = label.toLowerCase();
  if (lower.includes("ownership") || lower.includes("owned") || lower.includes("collection"))
    return "ownership";
  if (lower.includes("era") || lower.includes("timeline") || lower.includes("acquisition"))
    return "time";
  if (lower.includes("tag") || lower.includes("shelf") || lower.includes("organization") || lower.includes("list"))
    return "curation";
  return "play";
}

/**
 * Map a fixture archetype + strength tier to ArchetypeDetail for the drawer.
 */
export function fixtureToDetail(
  fixture: ArchetypeFixture,
  strengthTier: "emerging" | "strong" | "core"
): ArchetypeDetailLegacy {
  const signals: ArchetypeDetailSignal[] = fixture.signals.map((s) => ({
    type: signalTypeFromLabel(s.label),
    label: s.label,
    strength: confidenceToStrength(s.confidence),
    note: s.copy,
  }));

  const subtext = fixture.strength_tiers[strengthTier];

  return {
    id: fixture.key,
    name: fixture.name,
    icon: fixture.icon,
    strengthTier,
    description: fixture.why,
    subtext,
    signals,
    evolution: [],
    blends: undefined,
  };
}

/**
 * Get ArchetypeDetail for drawer by archetype key and strength tier.
 */
export function getArchetypeDetail(
  key: string,
  strengthTier: "emerging" | "strong" | "core"
): ArchetypeDetailLegacy | null {
  const fixture = getArchetypeFixture(key);
  if (!fixture) return null;
  return fixtureToDetail(fixture, strengthTier);
}
