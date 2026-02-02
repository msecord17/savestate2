/**
 * Archetype drawer fixtures — typed export for TS autocomplete and safety.
 * Source of truth: lib/identity/archetype-drawer-fixtures.json
 */

import type { ArchetypeFixture } from "@/lib/identity/types";
import {
  archetypeFixtures as rawFixtures,
  getArchetypeFixture as getFixture,
  getArchetypeDetail,
  fixtureToDetail,
} from "@/lib/identity/archetype-drawer-fixtures";

export type { ArchetypeFixture };

/** All archetype fixtures as a typed array. */
export const archetypeFixtures: ArchetypeFixture[] = rawFixtures;

/** Get a single fixture by key. */
export function getArchetypeFixture(key: string): ArchetypeFixture | undefined {
  return getFixture(key);
}

/** Resolve ArchetypeDetail for the drawer (key + strength tier). */
export {
  getArchetypeDetail,
  fixtureToDetail,
};

/** Typed map of known keys → fixture for autocomplete. */
export const ARCHETYPE_FIXTURES_BY_KEY = archetypeFixtures.reduce(
  (acc, a) => {
    acc[a.key as keyof typeof acc] = a;
    return acc;
  },
  {} as Record<string, ArchetypeFixture>
) as Record<string, ArchetypeFixture>;

/** Canonical catalog keyed by archetype key (label, one_liner, tier_copy, signals, icon, color_token). */
export {
  ARCHETYPE_CATALOG,
  getArchetypeCatalogEntry,
  getArchetypeColorToken,
  ARCHETYPE_COLOR_TOKENS,
} from "./catalog";
export type {
  ArchetypeCatalogEntry,
  ArchetypeCatalogSignal,
  TierCopy,
  SignalVerb,
} from "./catalog";
