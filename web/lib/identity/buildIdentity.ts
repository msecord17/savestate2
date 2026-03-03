/**
 * Shared identity builder used by GameHome (/api/identity/summary) and public profile.
 * Uses get_identity_signals RPC + computeCollectorArchetypes + summaryFromCollectorArchetypes.
 * Single source of truth so archetype/top_era match 100% between routes.
 */

import type { IdentitySummaryApiResponse } from "@/lib/identity/types";
import {
  summaryFromCollectorArchetypes,
  type GetIdentitySignalsJson,
} from "@/lib/identity/compute";
import { computeCollectorArchetypes, strengthTier } from "@/lib/identity/collector-archetypes";
import { normalizeEraKey } from "@/lib/identity/era_mapping";
import { normalizeTopEraForProfile } from "@/lib/identity/era-mapping";
import type { PlayedOnSummary } from "@/lib/identity/getPlayedOnSummary";
import type { MostPlayedOn } from "@/lib/identity/getMostPlayedOn";

function toPlatformCounts(raw: Record<string, number> | unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v))
  );
}

export type BuildIdentityResult = {
  summary: IdentitySummaryApiResponse;
  top_era: { key: string; legacy_key?: string | null; label: string; years: string };
  era_buckets: Record<string, { games: number; releases: number }> | null;
  archetypes: Array<{
    key: string;
    label: string;
    strength: "emerging" | "strong" | "core";
    score: number;
    reasons: string[];
  }>;
};

/**
 * Build identity from get_identity_signals RPC JSON.
 * Same logic as GameHome — archetype, top_era, top_signals, drawer all match.
 */
export function buildIdentityFromSignals(
  signalsJson: GetIdentitySignalsJson | null,
  playedOn?: PlayedOnSummary | null,
  mostPlayedOn?: MostPlayedOn | null
): BuildIdentityResult {
  const json = signalsJson ?? undefined;
  const platformCounts = toPlatformCounts(json?.platform_counts);
  const collectorArchetypes = computeCollectorArchetypes({ identity_signals: json }, platformCounts);
  const era_key = normalizeEraKey(json?.primary_era_key ?? json?.top_era_weighted ?? json?.top_era);
  const summary = summaryFromCollectorArchetypes(collectorArchetypes, era_key);
  const top_era = normalizeTopEraForProfile(
    json?.top_era_weighted ?? json?.top_era ?? json?.primary_era_key
  );
  const era_buckets = (json?.era_buckets ?? null) as Record<string, { games: number; releases: number }> | null;
  const archetypes = collectorArchetypes.map((a) => ({
    key: a.key,
    label: a.label,
    strength: a.strength,
    score: a.score,
    reasons: a.reasons,
  }));

  // Handheld-Era Gamer: played-on data shows strong handheld preference, or most-played is modern retro handheld
  const total = playedOn?.total_releases ?? 0;
  const handheld = playedOn?.by_kind?.handheld ?? 0;
  const consoleCount = playedOn?.by_kind?.console ?? 0;
  const handheldShare = total > 0 ? handheld / total : 0;
  const qualifiesHandheldEra =
    total >= 10 && handheldShare >= 0.6 && handheld >= consoleCount + 3;
  const qualifiesModernRetroHandheld =
    mostPlayedOn?.is_modern_retro_handheld === true && (mostPlayedOn?.total ?? 0) >= 8;

  if (qualifiesHandheldEra || qualifiesModernRetroHandheld) {
    const score = qualifiesModernRetroHandheld
      ? Math.min(100, (mostPlayedOn?.total ?? 0) * 5)
      : Math.min(100, Math.round(handheldShare * 100));
    const reason = qualifiesModernRetroHandheld
      ? `Most played on ${mostPlayedOn?.display_name ?? "modern retro handheld"}`
      : `Most played on handheld (${Math.round(handheldShare * 100)}%)`;
    archetypes.push({
      key: "handheld_era_gamer",
      label: "Handheld-Era Gamer",
      strength: strengthTier(score),
      score,
      reasons: [reason],
    });
  }

  return {
    summary,
    top_era,
    era_buckets,
    archetypes,
  };
}
