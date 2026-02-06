/**
 * Data contract for Identity Strip. Re-exports from canonical lib/identity/types.
 */

export type { IdentitySummary } from "@/lib/identity/types";

/** Fixture that mirrors the future API shape. Use until scoring engine is wired. */
export function getIdentitySummaryFixture(): IdentitySummary {
  return {
    primaryArchetype: {
      key: "explorer",
      name: "Explorer",
      tier: "strong",
      oneLiner: "You value discovery over closure.",
      icon: "Compass",
    },
    era: {
      key: "ps2",
      name: "PS2 Era",
      oneLiner: "Your library anchors in the PS2 era.",
      icon: "Gamepad2",
    },
    platforms: [
      { key: "steam", label: "Steam", icon: "Gamepad2" },
      { key: "psn", label: "PSN", icon: "Gamepad2" },
    ],
    evolution: {
      from: "Explorer",
      to: "Completionist",
      tag: "Trending",
    },
  };
}

/** Chip shape for IdentityStrip (no icon; add icon in UI if needed). */
export type IdentityChipInput = {
  key: string;
  label: string;
  sub?: string;
  onClick?: () => void;
};

/**
 * Map IdentitySummary to chip inputs for IdentityStrip. Pass onChipClick(key) to handle archetype/era taps.
 */
export function identitySummaryToChips(
  summary: IdentitySummary,
  onChipClick?: (key: string) => void
): IdentityChipInput[] {
  const chips: IdentityChipInput[] = [];

  chips.push({
    key: summary.primaryArchetype.key,
    label: summary.primaryArchetype.name,
    sub: summary.primaryArchetype.oneLiner,
    onClick: onChipClick ? () => onChipClick(summary.primaryArchetype.key) : undefined,
  });

  chips.push({
    key: `era_${summary.era.key}`,
    label: summary.era.name,
    sub: summary.era.oneLiner,
    onClick: onChipClick ? () => onChipClick(`era_${summary.era.key}`) : undefined,
  });

  for (const p of summary.platforms) {
    chips.push({ key: p.key, label: p.label });
  }

  if (summary.evolution) {
    chips.push({
      key: "evolution",
      label: `${summary.evolution.from} → ${summary.evolution.to}`,
      sub: summary.evolution.tag,
    });
  }

  return chips;
}
