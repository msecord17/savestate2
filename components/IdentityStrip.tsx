"use client";

import { getArchetypeCatalogEntry } from "@/lib/archetypes/catalog";
import type { ArchetypeScore } from "@/lib/archetypes/score";
import { tokens } from "@/src/design";
import { TOUCH_TARGET_CLASS, IDENTITY_STRIP_SCROLL_CLASS } from "@/src/design/layout-rules";

export type IdentityStripProps = {
  /** Primary archetype key (tap → opens drawer) */
  primaryArchetypeKey: string | null;
  /** Era key for era anchor chip (tap → opens drawer) */
  primaryEra: string | null;
  /** Top archetypes for secondary chip on tablet/desktop */
  archetypesTop: ArchetypeScore[];
  /** Platform flavors to show: PSN, Xbox, Steam, RA */
  platformFlavors?: string[];
  /** Evolution tag e.g. "Explorer → Completionist" (optional) */
  evolutionTag?: string | null;
  /** Collector flag (if ownership signals present) */
  collectorFlag?: boolean;
  onArchetypeTap: (key: string) => void;
};

const PLATFORM_LABELS: Record<string, string> = {
  PSN: "PSN",
  Steam: "Steam",
  Xbox: "Xbox",
  RA: "Retro",
};

/** Identity chip: ≥44px, tap opens drawer. Minimal text; iconography via short label. */
function Chip({
  label,
  onClick,
  style = {},
  className = "",
  "aria-label": ariaLabel,
}: {
  label: string;
  onClick: () => void;
  style?: React.CSSProperties;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-[var(--color-border)] px-4 font-bold text-[var(--color-text)] ${TOUCH_TARGET_CLASS} ${className}`.trim()}
      style={style}
    >
      {label}
    </button>
  );
}

/**
 * Identity Strip — top module on GameHome.
 * Mobile: horizontally scrollable (no wrap), chips ≥44px, minimal text.
 * Tablet/desktop: row with breathing room, 1–2 extra chips (secondary, strength).
 * No nested scroll inside the strip; strip is the single scroll container.
 */
export function IdentityStrip({
  primaryArchetypeKey,
  primaryEra,
  archetypesTop,
  platformFlavors = [],
  evolutionTag,
  collectorFlag,
  onArchetypeTap,
}: IdentityStripProps) {
  const primaryArchetype = primaryArchetypeKey ? getArchetypeCatalogEntry(primaryArchetypeKey) : null;
  const secondaryArchetype = archetypesTop[1];
  const primaryScore = archetypesTop.find((a) => a.key === primaryArchetypeKey);

  return (
    <section className="mb-5" aria-label="Your style">
      <div
        className={IDENTITY_STRIP_SCROLL_CLASS}
        style={{ minHeight: tokens.touchTargetMin + 8 }}
      >
        {/* Primary archetype */}
        {primaryArchetypeKey && primaryArchetype && (
          <Chip
            label={primaryArchetype.label}
            onClick={() => onArchetypeTap(primaryArchetypeKey)}
            style={{
              background: primaryArchetype.color_token ?? "var(--color-surface)",
            }}
            aria-label={`${primaryArchetype.label}, open details`}
          />
        )}

        {/* Era anchor */}
        {primaryEra && (
          <Chip
            label={getArchetypeCatalogEntry(`era_${primaryEra}`)?.label ?? primaryEra}
            onClick={() => onArchetypeTap(`era_${primaryEra}`)}
            style={{ background: "var(--archetype-era)" }}
            aria-label={`Era: ${primaryEra}, open details`}
          />
        )}

        {/* Platform flavor (display only; no drawer) */}
        {platformFlavors.map((p) => (
          <span
            key={p}
            role="img"
            aria-label={`Platform: ${p}`}
            className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] px-4 font-bold text-[var(--color-text)] ${TOUCH_TARGET_CLASS}`}
            style={{ background: "var(--color-surface)" }}
          >
            {PLATFORM_LABELS[p] ?? p}
          </span>
        ))}

        {/* Collector flag (placeholder for later) */}
        {collectorFlag && (
          <Chip
            label="Collector"
            onClick={() => onArchetypeTap("archivist")}
            style={{ background: "var(--color-surface)" }}
          />
        )}

        {/* Evolution tag (e.g. "Explorer → Completionist") */}
        {evolutionTag && evolutionTag.trim() && (
          <span
            role="status"
            aria-label={`Evolution: ${evolutionTag}`}
            className={`inline-flex shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] px-4 text-sm font-medium text-[var(--color-text-muted)] ${TOUCH_TARGET_CLASS}`}
            style={{ background: "var(--color-background-muted)" }}
          >
            {evolutionTag}
          </span>
        )}

        {/* Tablet/desktop only: secondary archetype */}
        {secondaryArchetype && secondaryArchetype.key !== primaryArchetypeKey && (
          <Chip
            label={secondaryArchetype.name}
            onClick={() => onArchetypeTap(secondaryArchetype.key)}
            style={{ background: "var(--color-surface)" }}
            aria-label={`${secondaryArchetype.name}, open details`}
            className="hidden md:inline-flex"
          />
        )}

        {/* Tablet/desktop only: strength */}
        {primaryScore?.tier && (
          <Chip
            label={primaryScore.tier === "core" ? "Core" : primaryScore.tier === "strong" ? "Strong" : "Emerging"}
            onClick={() => primaryArchetypeKey && onArchetypeTap(primaryArchetypeKey)}
            style={{ background: "var(--color-surface)" }}
            aria-label={`Strength: ${primaryScore.tier}`}
            className="hidden md:inline-flex"
          />
        )}
      </div>
    </section>
  );
}
