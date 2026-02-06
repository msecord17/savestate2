/**
 * Identity UI contract — single source of truth for summary, drawer, and API payload.
 */

export type IdentitySummary = {
  primaryArchetype: {
    key: string;
    name: string;
    tier: "emerging" | "strong" | "core";
    oneLiner: string;
    icon: string; // lucide icon name
  };
  era: { key: string; name: string; oneLiner: string; icon: string };
  platforms: Array<{ key: "psn" | "xbox" | "steam" | "ra"; label: string; icon: string }>;
  evolution?: { from: string; to: string; tag: string };
};

export type IdentitySignal = {
  key: string;
  label: string;
  value: number; // 0..1
  source: "play" | "taste" | "ownership" | "curation" | "time";
  note?: string;
};

export type ArchetypeDetail = {
  key: string;
  name: string;
  tier: "emerging" | "strong" | "core";
  oneLiner: string;
  description: string;
  signals: IdentitySignal[];
  evolution?: { from: string; to: string; tag: string };
  nextSteps: Array<{ label: string; hint: string }>;
};

/** API response for GET /api/identity/summary — single pipe for strip, top signals, drawer. */
export type IdentitySummaryApiResponse = {
  lifetime_score: number; // 0..1
  primary_archetype: {
    key: string;
    name: string;
    strength: "emerging" | "strong" | "core";
    one_liner: string;
    icon: string;
  };
  secondary_archetypes: Array<{
    key: string;
    name: string;
    strength: "emerging" | "strong" | "core";
    one_liner: string;
    icon: string;
  }>;
  era_affinity: { key: string; name: string; one_liner: string; icon: string };
  top_signals: Array<{ key: string; label: string; value: number; note?: string }>; // max 5
  evolution?: { tag: string; icon: string; note?: string; confidence: number } | null;
  /** Per-archetype evidence for drawer: signals, proof, next steps. */
  drawer: ArchetypeDetail;
  /** Games/releases per era for timeline (from identity_signals.era_buckets). */
  era_buckets?: Record<string, { games: number; releases: number }> | null;
  /** Nested identity signals; era_buckets here is the canonical timeline source. */
  identity_signals?: {
    era_buckets?: Record<string, { games: number; releases: number }> | null;
  } | null;
  /** Computed collector archetypes (identity_signals only); key, label, strength, score, reasons[]. */
  archetypes?: Array<{
    key: string;
    label: string;
    strength: "emerging" | "strong" | "core";
    score: number;
    reasons: string[];
  }>;
}

/** Compact identity blob for GameHome / top signals (single source of truth). */
export type CompactIdentitySignals = {
  playEvidence?: number;
  completion?: number;
  eraBreadth?: number;
  platformDiversity?: number;
  curation?: number;
  ownership?: number;
};

export type CompactIdentity = {
  primary_archetype: string;
  primary_era: string;
  signals: CompactIdentitySignals;
};

export type IdentityPayload = {
  ok: true;
  summary: IdentitySummary;
  drawer: ArchetypeDetail;
  /** Optional compact identity for top signals row (buildTopSignals). */
  identity?: CompactIdentity;
};

/** One notable game in an era (for timeline card + drawer). */
export type TimelineNotableGame = {
  title: string;
  platform?: string | null;
  cover_url?: string | null;
};

/** Single era in GET /api/identity/timeline response (new contract). */
export type EraTimelineItem = {
  era: string;
  label: string;
  years: string;
  rank: number;
  games: number;
  releases: number;
  topSignals: Array<{ key: string; label: string }>;
  notable: Array<{ release_id: string; title: string; cover_url: string | null }>;
  /** When < 3, drawer can show "Based on N titles with achievements". Omitted if 0. */
  titles_with_achievements?: number;
};

/** GET /api/identity/timeline?mode=&sort= response (new contract). */
export type TimelineResponse = {
  ok: true;
  user_id: string;
  mode: "release_year" | "played_on_gen";
  eras: EraTimelineItem[];
  /** Temporary: confirm bucketing; remove once validated */
  debug?: {
    playedOnCounts: { psn: number; xbox: number; steam: number; ra: number; none: number };
    psnTitlePlatformTop: Array<{ platform: string; count: number }>;
    xboxTitlePlatformTop: Array<{ platform: string; count: number }>;
  };
};

/** Single era in GET /api/identity/timeline response (legacy drawer/card). */
export type EraDetail = {
  key: string;
  label: string;
  years: string;
  rank: number;
  interpretation: string;
  signal_chips: [string, string, string];
  notable_games: TimelineNotableGame[];
  era_archetype?: { key: string; name: string } | null;
};

/** GET /api/identity/timeline?mode= response (legacy). */
export type TimelineApiResponse = {
  user_id: string;
  mode: "dominance" | "chronological";
  eras: EraDetail[];
};
