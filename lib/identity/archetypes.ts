/**
 * Identity archetype scoring — exact formulas and tiers per spec.
 * Strength tiers: 35/60/80. Helpers: sat, lin, blend. computeArchetypes → 1 primary + up to 2 secondaries.
 */

export type StrengthTier = "hidden" | "emerging" | "strong" | "core";

export function strengthFromScore(score: number): StrengthTier {
  if (score >= 80) return "core";
  if (score >= 60) return "strong";
  if (score >= 35) return "emerging";
  return "hidden";
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// Saturating curve: returns 0..100
export function sat(value: number, softCap: number) {
  const v = Math.max(0, value || 0);
  const c = Math.max(1, softCap || 1);
  return clamp(100 * (v / (v + c)), 0, 100);
}

// Linear mapping: returns 0..100
export function lin(value: number, minVal: number, maxVal: number) {
  if (maxVal <= minVal) return 0;
  return clamp(((value - minVal) / (maxVal - minVal)) * 100, 0, 100);
}

// Weighted blend of 0..100 inputs
export function blend(parts: Array<{ w: number; s: number }>) {
  const totalW = parts.reduce((a, p) => a + p.w, 0) || 1;
  const sum = parts.reduce((a, p) => a + p.w * p.s, 0);
  return clamp(sum / totalW, 0, 100);
}

export type IdentitySignals = {
  owned_titles: number; // count of portfolio_entries (distinct releases ok)
  owned_games?: number; // distinct games (library spine) — lights up collector without play
  unique_platforms: number; // distinct releases.platform_key
  era_span_years: number; // maxYear - minYear across releases/games
  primary_era_share: number; // 0..1  (max era bucket count / total)
  primary_era_count: number; // count in that top era
  achievements_total: number; // trophies+achievements sum
  completion_count?: number; // plats/100% etc (optional)
  achievements_last_90d?: number; // optional
  collector_fields?: number; // optional, later: tags/shelves/notes/condition fields count
  weeks_active?: number; // optional
  top_platform_releases?: number; // releases on top platform — for Platform Loyalist
};

export type ArchetypeId =
  | "completionist"
  | "achievement_hunter"
  | "explorer"
  | "archivist"
  | "era_keeper"
  | "platform_loyalist"
  | "variant_hunter"; // placeholder for future collector variant modeling

export type ArchetypeResult = {
  id: ArchetypeId;
  score: number; // 0..100
  strength: StrengthTier; // hidden/emerging/strong/core
  reasons: string[]; // short strings for drawer ("Top signals")
  gate_passed: boolean;
};

export type ArchetypeDef = {
  id: ArchetypeId;
  name: string;
  gate: (s: IdentitySignals) => boolean;
  score: (s: IdentitySignals) => { score: number; reasons: string[] };
};

export const ARCHETYPES: ArchetypeDef[] = [
  {
    id: "completionist",
    name: "Completionist",
    gate: (s) => (s.achievements_total >= 200) || ((s.completion_count ?? 0) >= 5),
    score: (s) => {
      const a = sat(s.achievements_total, 600); // 200≈25, 600=50, 1500≈71
      const c = sat((s.completion_count ?? 0), 25); // 5≈17, 25=50, 60≈71
      // If completion_count missing, achievements carry more weight automatically.
      const hasC = (s.completion_count ?? 0) > 0;
      const score = hasC
        ? blend([{ w: 0.6, s: a }, { w: 0.4, s: c }])
        : blend([{ w: 1.0, s: a }]);

      const reasons: string[] = [
        `Achievements: ${s.achievements_total.toLocaleString()}`,
      ];
      if (hasC) reasons.push(`Completions: ${(s.completion_count ?? 0).toLocaleString()}`);
      return { score, reasons };
    },
  },

  {
    id: "achievement_hunter",
    name: "Achievement Hunter",
    gate: (s) => s.achievements_total >= 500,
    score: (s) => {
      const a = sat(s.achievements_total, 2000);
      const r = sat((s.achievements_last_90d ?? 0), 150); // optional, but nice
      const hasR = (s.achievements_last_90d ?? 0) > 0;
      const score = hasR
        ? blend([{ w: 0.7, s: a }, { w: 0.3, s: r }])
        : blend([{ w: 1.0, s: a }]);

      const reasons: string[] = [
        `Total: ${s.achievements_total.toLocaleString()}`,
      ];
      if (hasR) reasons.push(`Last 90d: ${(s.achievements_last_90d ?? 0).toLocaleString()}`);
      return { score, reasons };
    },
  },

  {
    id: "explorer",
    name: "Explorer",
    gate: (s) => s.owned_titles >= 30,
    score: (s) => {
      const p = sat(s.unique_platforms, 4); // 1≈20, 3≈43, 6≈60, 10≈71
      const o = sat(s.owned_titles, 250); // 30≈11, 100≈29, 300≈55, 1000≈80
      const e = sat(s.era_span_years, 25); // 5≈17, 25=50, 50≈67, 80≈76
      const score = blend([
        { w: 0.35, s: p },
        { w: 0.35, s: o },
        { w: 0.30, s: e },
      ]);

      const reasons = [
        `Platforms: ${s.unique_platforms}`,
        `Library: ${s.owned_titles.toLocaleString()}`,
        `Era span: ${s.era_span_years}y`,
      ];
      return { score, reasons };
    },
  },

  {
    id: "archivist",
    name: "Archivist",
    gate: (s) =>
      (s.owned_titles >= 200) ||
      ((s.owned_games ?? 0) >= 80) ||
      ((s.collector_fields ?? 0) >= 20),
    score: (s) => {
      // Prefer owned_games (library spine) when present so collectors show without play evidence
      const librarySize = s.owned_games ?? s.owned_titles;
      const o = sat(librarySize, 800); // big libraries pop, but saturate
      const f = sat((s.collector_fields ?? 0), 60); // org fields (future)
      const w = sat((s.weeks_active ?? 0), 26); // future: 6mo activity ≈ 50

      const hasF = (s.collector_fields ?? 0) > 0;
      const hasW = (s.weeks_active ?? 0) > 0;

      const score = blend([
        { w: hasF ? 0.40 : 0.75, s: o },
        { w: hasF ? 0.40 : 0.00, s: f },
        { w: hasW ? 0.20 : 0.25, s: w },
      ]);

      const reasons = [
        s.owned_games != null && s.owned_games >= 80
          ? `You've collected ${s.owned_games.toLocaleString()} games`
          : `Curated library: ${s.owned_titles.toLocaleString()} titles`,
      ];
      if (hasF) reasons.push(`Curation fields: ${(s.collector_fields ?? 0).toLocaleString()}`);
      if (hasW) reasons.push(`Active weeks: ${(s.weeks_active ?? 0).toLocaleString()}`);
      return { score, reasons };
    },
  },

  {
    id: "era_keeper",
    name: "Era Keeper",
    gate: (s) => s.owned_titles >= 30 && s.primary_era_count >= 12,
    score: (s) => {
      // primary_era_share: 0.25 -> 0, 0.65 -> 100
      const share = lin(s.primary_era_share, 0.25, 0.65);
      const depth = sat(s.primary_era_count, 120);

      const score = blend([
        { w: 0.70, s: share },
        { w: 0.30, s: depth },
      ]);

      const reasons = [
        "You've concentrated in one era.",
        `Primary era: ${Math.round(s.primary_era_share * 100)}% · ${s.primary_era_count.toLocaleString()} titles`,
      ];
      return { score, reasons };
    },
  },

  {
    id: "platform_loyalist",
    name: "Platform Loyalist",
    gate: (s) => {
      const total = Math.max(s.owned_titles, 1);
      const top = s.top_platform_releases ?? 0;
      return s.owned_titles >= 20 && total > 0 && top / total >= 0.45;
    },
    score: (s) => {
      const total = Math.max(s.owned_titles, 1);
      const top = s.top_platform_releases ?? 0;
      const share = top / total; // 0..1
      const shareScore = lin(share, 0.45, 0.85); // 45% -> 0, 85% -> 100
      const depth = sat(top, 80);

      const score = blend([
        { w: 0.65, s: shareScore },
        { w: 0.35, s: depth },
      ]);

      const reasons = [
        "You've concentrated on one platform.",
        `Top platform: ${top.toLocaleString()} of ${s.owned_titles.toLocaleString()} releases (${Math.round(share * 100)}%)`,
      ];
      return { score, reasons };
    },
  },

  // Placeholder until you model variants/editions/regions.
  {
    id: "variant_hunter",
    name: "Variant Hunter",
    gate: (s) => (s.collector_fields ?? 0) >= 80, // placeholder gate so it doesn't show prematurely
    score: (s) => {
      const f = sat((s.collector_fields ?? 0), 120);
      return { score: f, reasons: [`Curation fields: ${(s.collector_fields ?? 0).toLocaleString()}`] };
    },
  },
];

export function computeArchetypes(signals: IdentitySignals): ArchetypeResult[] {
  const results: ArchetypeResult[] = ARCHETYPES.map((def) => {
    const gate_passed = def.gate(signals);
    const { score, reasons } = gate_passed ? def.score(signals) : { score: 0, reasons: [] as string[] };
    const strength = gate_passed ? strengthFromScore(score) : "hidden";
    return { id: def.id, score, strength, reasons, gate_passed };
  });

  // Filter hidden; sort by score desc
  const visible = results.filter((r) => r.strength !== "hidden").sort((a, b) => b.score - a.score);

  // Keep it tight: 1 primary + up to 2 secondaries (score >= 55)
  if (!visible.length) return [];

  const primary = visible[0];
  const secondaries = visible.slice(1).filter((r) => r.score >= 55).slice(0, 2);

  return [primary, ...secondaries];
}

// Copy per strength tier (locked) — use these exact strings in the drawer header.
export const STRENGTH_COPY: Record<Exclude<StrengthTier, "hidden">, { label: string; blurb: string }> = {
  emerging: { label: "Emerging", blurb: "Showing the signs." },
  strong:   { label: "Strong",   blurb: "A defining pattern." },
  core:     { label: "Core",     blurb: "This is your signature." },
};
