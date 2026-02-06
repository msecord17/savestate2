/**
 * Identity summary from Supabase RPCs. Uses archetype scorer (lib/identity/archetypes.ts)
 * when identity_signals RPC is available; otherwise falls back to v0 legacy compute.
 */

import type {
  IdentitySummaryApiResponse,
  ArchetypeDetail,
  IdentitySignal,
} from "@/lib/identity/types";
import { ERA_THEME, ARCHETYPE_THEME } from "@/lib/identity/strip-themes";
import {
  computeArchetypes,
  STRENGTH_COPY,
  ARCHETYPES,
  type IdentitySignals,
  type ArchetypeResult,
} from "@/lib/identity/archetypes";
import type { CollectorArchetype } from "@/lib/identity/collector-archetypes";

export type IdentityRpcRow = {
  platform_counts: {
    psn: number;
    xbox: number;
    steam: number;
    ra: number;
    platform_spread_score: number;
  };
  trophy_stats: {
    completion_score: number;
    playtime_score: number;
    has_any_completion: boolean;
  };
  era_key: string;
};

/** Row shape returned by identity_signals RPC (single row). */
export type IdentitySignalsRpcRow = {
  owned_titles: number;
  unique_platforms: number;
  era_span_years: number;
  primary_era_share: number;
  primary_era_count: number;
  achievements_total: number;
  completion_count: number;
  achievements_last_90d: number;
  era_key: string;
};

const ARCHETYPE_KEYS = ["explorer", "completionist", "deep_diver"] as const;
const ARCHETYPE_META: Record<
  string,
  { name: string; icon: string; oneLiner: string; description: string }
> = {
  explorer: {
    name: "Explorer",
    icon: "Compass",
    oneLiner: "You value discovery over closure.",
    description:
      "You sample widely and follow curiosity. Breadth matters more than checkmarks.",
  },
  completionist: {
    name: "Completionist",
    icon: "CheckCircle2",
    oneLiner: "You finish what you start.",
    description:
      "You tend to see games through to the end. Completion is a consistent pattern.",
  },
  deep_diver: {
    name: "Deep Diver",
    icon: "Waves",
    oneLiner: "You invest deeply in fewer titles.",
    description:
      "Your play clusters in a smaller set of games with strong engagement.",
  },
  achievement_hunter: {
    name: "Achievement Hunter",
    icon: "Trophy",
    oneLiner: "You chase milestones and max out progress.",
    description: "Achievements and trophies drive your play.",
  },
  archivist: {
    name: "Archivist",
    icon: "Archive",
    oneLiner: "You've collected and curated a large library.",
    description: "Collection size and curation matter—even without play logs.",
  },
  era_keeper: {
    name: "Era Keeper",
    icon: "Clock",
    oneLiner: "You've concentrated your library in one era.",
    description: "A particular gaming era defines your collection.",
  },
  platform_loyalist: {
    name: "Platform Loyalist",
    icon: "Gamepad2",
    oneLiner: "You've concentrated on one platform.",
    description: "Most of your library lives on a single platform.",
  },
  variant_hunter: {
    name: "Variant Hunter",
    icon: "Layers",
    oneLiner: "You track editions and variants.",
    description: "Variants and curation fields drive your collection.",
  },
};

function strengthFromScoreLegacy(score: number): "emerging" | "strong" | "core" {
  if (score >= 0.6) return "core";
  if (score >= 0.3) return "strong";
  return "emerging";
}

/** Build IdentitySignals from identity_signals RPC row. */
export function identitySignalsFromRpcRow(row: IdentitySignalsRpcRow): IdentitySignals {
  return {
    owned_titles: Number(row.owned_titles ?? 0),
    unique_platforms: Number(row.unique_platforms ?? 0),
    era_span_years: Number(row.era_span_years ?? 0),
    primary_era_share: Number(row.primary_era_share ?? 0),
    primary_era_count: Number(row.primary_era_count ?? 0),
    achievements_total: Number(row.achievements_total ?? 0),
    completion_count: Number(row.completion_count ?? 0) || undefined,
    achievements_last_90d: Number(row.achievements_last_90d ?? 0) || undefined,
  };
}

/** JSON shape returned by get_identity_signals RPC. */
export type GetIdentitySignalsJson = {
  owned_entries?: number;
  owned_releases?: number;
  owned_games?: number;
  unique_platforms?: number;
  owned_with_known_era?: number;
  era_span_years?: number;
  primary_era_key?: string | null;
  primary_era_count?: number;
  primary_era_share?: number;
  achievements_earned?: number;
  achievements_total?: number;
  minutes_played?: number;
  era_buckets?: Record<string, { games?: number; releases?: number }>;
  top_platform?: string | null;
  top_platform_releases?: number;
  platform_counts?: Record<string, number>;
};

/** Map get_identity_signals RPC JSON to IdentitySignals for archetype scorer. */
export function identitySignalsFromGetIdentitySignalsJson(json: GetIdentitySignalsJson | null): IdentitySignals {
  if (!json) {
    return {
      owned_titles: 0,
      unique_platforms: 0,
      era_span_years: 0,
      primary_era_share: 0,
      primary_era_count: 0,
      achievements_total: 0,
    };
  }
  return {
    owned_titles: Number(json.owned_releases ?? json.owned_entries ?? 0),
    owned_games: json.owned_games != null ? Number(json.owned_games) : undefined,
    unique_platforms: Number(json.unique_platforms ?? 0),
    era_span_years: Number(json.era_span_years ?? 0),
    primary_era_share: Number(json.primary_era_share ?? 0),
    primary_era_count: Number(json.primary_era_count ?? 0),
    achievements_total: Number(json.achievements_earned ?? json.achievements_total ?? 0),
    completion_count: undefined,
    achievements_last_90d: undefined,
    top_platform_releases: json.top_platform_releases != null ? Number(json.top_platform_releases) : undefined,
  };
}

/** Map primary_era_key from get_identity_signals to strip ERA_THEME key (atari, nes, ps2, modern, etc.). */
export function eraKeyFromPrimaryEra(primary_era_key: string | null | undefined): string {
  const map: Record<string, string> = {
    early_arcade_pre_crash: "atari",
    "8bit_home": "nes",
    "16bit": "snes",
    "32_64bit": "ps1",
    ps2_xbox_gc: "ps2",
    hd_era: "ps3_360",
    ps4_xbo: "modern",
    switch_wave: "modern",
    modern: "modern",
    unknown: "modern",
  };
  const key = primary_era_key ?? "modern";
  return map[key] ?? "modern";
}

/** Map computeArchetypes() result + era_key to IdentitySummaryApiResponse. */
export function identitySummaryFromArchetypes(
  results: ArchetypeResult[],
  era_key: string
): IdentitySummaryApiResponse {
  const eraTheme = ERA_THEME[era_key] ?? ERA_THEME.modern;
  const eraName = eraTheme?.label ?? "Modern";
  const eraIcon = eraTheme?.icon ?? "Sparkles";

  if (!results.length) {
    return legacyFallbackSummary(era_key, eraName, eraIcon);
  }

  const primary = results[0];
  const secondaries = results.slice(1, 3);
  const def = ARCHETYPES.find((d) => d.id === primary.id);
  const name = def?.name ?? primary.id;
  const theme = ARCHETYPE_THEME[primary.id];
  const icon = theme?.icon ?? "UserRound";
  const meta = ARCHETYPE_META[primary.id];
  const oneLiner = meta?.oneLiner ?? name;
  const strength = primary.strength as "emerging" | "strong" | "core";
  const strengthCopy = STRENGTH_COPY[strength];

  const top_signals: IdentitySummaryApiResponse["top_signals"] = primary.reasons
    .slice(0, 5)
    .map((label, i) => ({
      key: `${primary.id}_${i}`,
      label,
      value: primary.score / 100,
      note: undefined,
    }));

  const drawerSignals: IdentitySignal[] = primary.reasons.map((label, i) => ({
    key: `${primary.id}_${i}`,
    label,
    value: primary.score / 100,
    source: "play",
    note: undefined,
  }));

  const drawer: ArchetypeDetail = {
    key: primary.id,
    name,
    tier: strength,
    oneLiner,
    description: strengthCopy?.blurb ?? oneLiner,
    signals: drawerSignals.length ? drawerSignals : [{ key: "placeholder", label: "Connect platforms to see signals", value: 0, source: "play" }],
    nextSteps: [
      { label: "Connect more platforms", hint: "Link Steam, PSN, or Xbox for richer signals." },
      { label: "Sync progress", hint: "Trophies and playtime refine your archetype." },
    ],
  };

  return {
    lifetime_score: primary.score / 100,
    primary_archetype: { key: primary.id, name, strength, one_liner: oneLiner, icon },
    secondary_archetypes: secondaries.map((r) => {
      const d = ARCHETYPES.find((x) => x.id === r.id);
      const t = ARCHETYPE_THEME[r.id];
      const m = ARCHETYPE_META[r.id];
      return {
        key: r.id,
        name: d?.name ?? r.id,
        strength: r.strength as "emerging" | "strong" | "core",
        one_liner: m?.oneLiner ?? d?.name ?? r.id,
        icon: t?.icon ?? "UserRound",
      };
    }),
    era_affinity: { key: era_key || "modern", name: eraName, one_liner: `Your library leans ${eraName}.`, icon: eraIcon },
    top_signals,
    evolution: null,
    drawer,
  };
}

function legacyFallbackSummary(era_key: string, eraName: string, eraIcon: string): IdentitySummaryApiResponse {
  const key = "explorer";
  const meta = ARCHETYPE_META[key];
  const theme = ARCHETYPE_THEME[key];
  return {
    lifetime_score: 0.1,
    primary_archetype: { key, name: meta.name, strength: "emerging", one_liner: meta.oneLiner, icon: meta.icon },
    secondary_archetypes: [],
    era_affinity: { key: era_key || "modern", name: eraName, one_liner: `Your library leans ${eraName}.`, icon: eraIcon },
    top_signals: [],
    evolution: null,
    drawer: {
      key,
      name: meta.name,
      tier: "emerging",
      oneLiner: meta.oneLiner,
      description: meta.description,
      signals: [{ key: "placeholder", label: "Connect platforms to see signals", value: 0, source: "play" }],
      nextSteps: [
        { label: "Connect more platforms", hint: "Link Steam, PSN, or Xbox for richer signals." },
        { label: "Sync progress", hint: "Trophies and playtime refine your archetype." },
      ],
    },
  };
}

/** Build IdentitySummaryApiResponse from computed collector archetypes (identity_signals only). */
export function summaryFromCollectorArchetypes(
  collectorArchetypes: CollectorArchetype[],
  era_key: string
): IdentitySummaryApiResponse {
  const eraTheme = ERA_THEME[era_key] ?? ERA_THEME.modern;
  const eraName = eraTheme?.label ?? "Modern";
  const eraIcon = eraTheme?.icon ?? "Sparkles";

  if (!collectorArchetypes.length) {
    return legacyFallbackSummary(era_key, eraName, eraIcon);
  }

  const primary = collectorArchetypes[0];
  const secondaries = collectorArchetypes.slice(1, 3);
  const meta = ARCHETYPE_META[primary.key];
  const theme = ARCHETYPE_THEME[primary.key];

  const top_signals: IdentitySummaryApiResponse["top_signals"] = primary.reasons.slice(0, 5).map((label, i) => ({
    key: `${primary.key}_${i}`,
    label,
    value: primary.score / 100,
    note: undefined,
  }));

  const drawerSignals: IdentitySignal[] = primary.reasons.map((label, i) => ({
    key: `${primary.key}_${i}`,
    label,
    value: primary.score / 100,
    source: "ownership" as const,
    note: undefined,
  }));

  // Collector drawer copy: use "You've collected…", "Your library leans…", "You curate…"; never "completed"/"mastered" without play evidence
  const collectorDescription: Record<string, string> = {
    archivist: "You've collected and curated. Your library size and breadth define this identity.",
    era_keeper: "Your library leans heavily on one era. You've concentrated your collection there.",
    platform_loyalist: "You've concentrated on one platform. Your library leans there.",
  };
  const drawerDescription =
    collectorDescription[primary.key] ??
    STRENGTH_COPY[primary.strength]?.blurb ??
    meta?.oneLiner ??
    primary.label;

  const drawer: ArchetypeDetail = {
    key: primary.key,
    name: primary.label,
    tier: primary.strength,
    oneLiner: meta?.oneLiner ?? primary.label,
    description: drawerDescription,
    signals: drawerSignals.length ? drawerSignals : [{ key: "placeholder", label: "Based on your library", value: primary.score / 100, source: "ownership" }],
    nextSteps: [
      { label: "Connect more platforms", hint: "Link Steam, PSN, or Xbox for richer signals." },
      { label: "Sync playtime or trophies", hint: "Add play-based signals; no completion required." },
    ],
  };

  return {
    lifetime_score: primary.score / 100,
    primary_archetype: {
      key: primary.key,
      name: primary.label,
      strength: primary.strength,
      one_liner: meta?.oneLiner ?? primary.label,
      icon: theme?.icon ?? meta?.icon ?? "UserRound",
    },
    secondary_archetypes: secondaries.map((r) => {
      const m = ARCHETYPE_META[r.key];
      const t = ARCHETYPE_THEME[r.key];
      return {
        key: r.key,
        name: r.label,
        strength: r.strength,
        one_liner: m?.oneLiner ?? r.label,
        icon: t?.icon ?? "UserRound",
      };
    }),
    era_affinity: { key: era_key || "modern", name: eraName, one_liner: `Your library leans ${eraName}.`, icon: eraIcon },
    top_signals,
    evolution: null,
    drawer,
  };
}

/**
 * Pure v0 compute: RPC row -> API response. No I/O.
 */
export function computeIdentitySummaryFromRpc(row: IdentityRpcRow): IdentitySummaryApiResponse {
  const { platform_counts, trophy_stats, era_key } = row;
  const spread = trophy_stats.completion_score ?? 0;
  const play = trophy_stats.playtime_score ?? 0;
  const platformSpread = platform_counts.platform_spread_score ?? 0;

  // Primary archetype: completion dominant -> completionist; play dominant + low spread -> deep_diver; else explorer
  let primaryKey: (typeof ARCHETYPE_KEYS)[number] = "explorer";
  if (spread >= 0.4 && spread >= play) primaryKey = "completionist";
  else if (play >= 0.35 && platformSpread < 0.6) primaryKey = "deep_diver";

  const meta = ARCHETYPE_META[primaryKey] ?? ARCHETYPE_META.explorer;
  const composite = (spread * 0.4 + play * 0.4 + platformSpread * 0.2) || 0.1;
  const strength = strengthFromScoreLegacy(composite);

  const eraTheme = ERA_THEME[era_key] ?? ERA_THEME.modern;
  const eraName = eraTheme?.label ?? "Modern";
  const eraIcon = eraTheme?.icon ?? "Sparkles";

  const top_signals: IdentitySummaryApiResponse["top_signals"] = [];
  if (trophy_stats.has_any_completion && spread > 0)
    top_signals.push({
      key: "completion",
      label: "Trophies & achievements",
      value: spread,
      note: "Completion progress across connected platforms.",
    });
  if (play > 0)
    top_signals.push({
      key: "play_evidence",
      label: "Play time",
      value: play,
      note: "Cumulative playtime (Steam, PSN, portfolio).",
    });
  if (platformSpread > 0)
    top_signals.push({
      key: "platform_diversity",
      label: "Platform spread",
      value: platformSpread,
      note: "Library spans multiple platforms.",
    });
  top_signals.sort((a, b) => b.value - a.value);
  const top5 = top_signals.slice(0, 5);

  const signals: IdentitySignal[] = [
    {
      key: "completion",
      label: "Trophies & achievements",
      value: spread,
      source: "play" as const,
      note: "Completion progress.",
    },
    {
      key: "depth",
      label: "Play time",
      value: play,
      source: "time" as const,
      note: "Cumulative play.",
    },
    {
      key: "platforms",
      label: "Platform spread",
      value: platformSpread,
      source: "ownership" as const,
      note: "Library diversity.",
    },
  ].filter((s) => s.value > 0);

  const drawer: ArchetypeDetail = {
    key: primaryKey,
    name: meta.name,
    tier: strength,
    oneLiner: meta.oneLiner,
    description: meta.description,
    signals: signals.length ? signals : [{ key: "placeholder", label: "Connect platforms to see signals", value: 0, source: "play" }],
    nextSteps: [
      { label: "Connect more platforms", hint: "Link Steam, PSN, or Xbox for richer signals." },
      { label: "Sync progress", hint: "Trophies and playtime refine your archetype." },
    ],
  };

  return {
    lifetime_score: composite,
    primary_archetype: {
      key: primaryKey,
      name: meta.name,
      strength,
      one_liner: meta.oneLiner,
      icon: meta.icon,
    },
    secondary_archetypes: ARCHETYPE_KEYS.filter((k) => k !== primaryKey).map((k) => {
      const m = ARCHETYPE_META[k] ?? ARCHETYPE_META.explorer;
      return { key: k, name: m.name, strength: "emerging" as const, one_liner: m.oneLiner, icon: m.icon };
    }),
    era_affinity: {
      key: era_key || "modern",
      name: eraName,
      one_liner: `Your library leans ${eraName}.`,
      icon: eraIcon,
    },
    top_signals: top5,
    evolution: null,
    drawer,
  };
}
