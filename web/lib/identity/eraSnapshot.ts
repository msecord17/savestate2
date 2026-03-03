import { toEraKey } from "@/lib/identity/eras";

type NotableGame = {
  title: string;
  played_on?: string | null; // e.g. "Played on: Steam Deck"
  earned?: number | null;
  total?: number | null;
  minutes_played?: number | null;
};

type EraSnapshotArgs = {
  seed: string; // username or user_id (anything stable)
  eraKey: string; // can be legacy; we normalize
  eraLabel: string; // "Gen 6"
  eraYears?: string; // "PS2 • GameCube • Xbox • Dreamcast"
  archetypeName?: string | null; // "Archivist"
  ownedGames?: number | null;
  ownedReleases?: number | null;
  sharePct?: number | null; // 0..1
  notableGames?: NotableGame[];
  eraMostPlayedOnName?: string | null;
  eraMostPlayedOnSource?: "manual" | "auto" | null;
};

const ERA_FLAVOR: Record<string, string[]> = {
  gen1_1972_1977: ["the primordial arcade haze", "the pioneer days"],
  gen2_1978_1982: ["cartridge-era classics", "the early living-room invasion"],
  gen3_1983_1989: ["the comeback era", "the 8-bit revival"],
  gen4_1990_1995: ["the 16-bit glow", "the console wars peak"],
  gen5_1996_1999: ["the polygon adolescence", "the jump to 3D"],
  gen6_2000_2005: ["the DVD-era bangers", "the PS2/GameCube/Xbox golden mess"],
  gen7_2006_2012: ["the HD coming-of-age", "the always-online awakening"],
  gen8_2013_2019: ["the digital-everything era", "the backlog explosion years"],
  gen9_2020_plus: ["the modern flex era", "the now-times: huge games, huge libraries"],
  unknown: ["your mystery shelf", "the unclassified pile (still counts)"],
};

function hashToIndex(seed: string, mod: number) {
  // djb2-ish
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = (h * 33) ^ seed.charCodeAt(i);
  return Math.abs(h) % mod;
}

function minutesToHours(min?: number | null) {
  if (!min || min <= 0) return null;
  const h = min / 60;
  if (h < 1) return "<1h";
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}

function stripPlayedOnLabel(s?: string | null) {
  if (!s) return null;
  return s.replace(/^Played on:\s*/i, "").trim();
}

function parsePlatforms(eraYears?: string) {
  if (!eraYears) return [];
  return eraYears
    .split("•")
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickAnchors(seed: string, list: string[], n = 2) {
  if (!list.length) return [];
  const idx0 = hashToIndex(`${seed}|anchor0`, list.length);
  const idx1 = hashToIndex(`${seed}|anchor1`, list.length);
  const a = list[idx0];
  const b = list.length > 1 ? list[(idx1 + 1) % list.length] : null;
  const out = [a];
  if (b && b !== a && out.length < n) out.push(b);
  return out;
}

function hasStrongEvidence(n?: NotableGame) {
  if (!n) return false;
  if (typeof n.minutes_played === "number" && n.minutes_played > 0) return true;
  if (n.played_on && n.played_on.trim().length > 0) return true;
  if (typeof n.earned === "number" && typeof n.total === "number" && n.total > 0) return true;
  return false;
}

function evidenceScore(n?: NotableGame & { score?: number | null }) {
  if (!n) return -1;

  let s = 0;

  // strongest: time exists
  if (typeof n.minutes_played === "number" && n.minutes_played > 0) {
    // gently scale; 60 min ~= +6, 600 min ~= +10
    s += Math.min(10, Math.log10(1 + n.minutes_played) * 3);
  }

  // device context is great identity juice
  if (n.played_on && n.played_on.trim().length > 0) s += 2;

  // achievements provide "proof"
  if (
    typeof n.earned === "number" &&
    typeof n.total === "number" &&
    n.total > 0
  ) {
    const pct = n.earned / n.total;
    s += 1 + Math.min(3, pct * 3);
  }

  // optional: if you have a precomputed standout score
  if (typeof (n as any).score === "number") s += Math.min(3, (n as any).score / 10);

  // tiny bump for having a title (always true, but keeps it safe)
  if (n.title) s += 0.1;

  return s;
}

function pickStandoutPhrase(n?: NotableGame) {
  if (!n?.title) return null;

  const bits: string[] = [];
  const h = minutesToHours(n.minutes_played);
  if (h) bits.push(h);

  if (typeof n.earned === "number" && typeof n.total === "number" && n.total > 0) {
    bits.push(`${n.earned}/${n.total} achievements`);
  }

  const device = stripPlayedOnLabel(n.played_on);
  if (device) bits.push(`on ${device}`);

  if (bits.length === 0) return `Standout: ${n.title}.`;
  return `Standout: ${n.title} (${bits.join(" • ")}).`;
}

export function buildEraSnapshot(args: EraSnapshotArgs): string {
  const k = toEraKey(args.eraKey);
  const flavors = ERA_FLAVOR[k] ?? ["this era"];
  const flavor = flavors[hashToIndex(`${args.seed}|${k}|flavor`, flavors.length)];

  const ownedGames = typeof args.ownedGames === "number" ? args.ownedGames : null;
  const ownedReleases = typeof args.ownedReleases === "number" ? args.ownedReleases : null;
  const pct = typeof args.sharePct === "number" ? Math.round(args.sharePct * 100) : null;

  const statBits: string[] = [];
  if (ownedGames != null) statBits.push(`${ownedGames} games`);
  if (ownedReleases != null) statBits.push(`${ownedReleases} releases`);
  if (pct != null) statBits.push(`${pct}% of your library`);
  const stats = statBits.length ? statBits.join(" • ") : null;

  const candidates = (args.notableGames ?? []).filter((g) => g?.title);

  const ranked = candidates
    .map((g) => ({ g, s: evidenceScore(g as any) }))
    .sort((a, b) => b.s - a.s || a.g.title.localeCompare(b.g.title));

  const top = ranked[0]?.g;
  const runner = ranked[1]?.g;
  const standout1 = pickStandoutPhrase(top);
  const standout2 = pickStandoutPhrase(runner);

  const platforms = parsePlatforms(args.eraYears);
  const anchors = pickAnchors(`${args.seed}|${k}`, platforms, 2);

  const topStrong = hasStrongEvidence(top);
  const runnerStrong = hasStrongEvidence(runner);

  // If we don't have evidence-rich standouts, anchor to platforms instead.
  const shouldUsePlatformFallback = !topStrong && !runnerStrong;

  // Slight archetype seasoning (optional, not repetitive)
  const arch = args.archetypeName?.trim();
  const archTag = arch ? `Your ${arch} energy` : "Your vibe";

  const playedOnPhrase =
    args.eraMostPlayedOnName?.trim()
      ? `Mostly played on: ${args.eraMostPlayedOnName}${args.eraMostPlayedOnSource === "auto" ? " (Auto)" : ""}.`
      : null;

  const fallbackTemplates = [
    () => {
      const p = anchors.length ? anchors.join(" + ") : null;
      const base = `${args.eraLabel} is ${flavor}${p ? ` — ${p}` : ""}. ${stats ? `${stats}.` : ""}`.trim();
      return playedOnPhrase ? `${base} ${playedOnPhrase}`.trim() : base;
    },
    () => {
      const p = anchors.length ? anchors.join(", ") : null;
      const base = `${archTag} shows up in ${args.eraLabel}${p ? ` across ${p}` : ""}. ${stats ? `${stats}.` : ""}`.trim();
      return playedOnPhrase ? `${base} ${playedOnPhrase}`.trim() : base;
    },
  ];

  const evidenceTemplates = [
    () => `${args.eraLabel} is ${flavor}. ${stats ? `${stats}. ` : ""}${standout1 ?? ""}`.trim(),
    () =>
      `${archTag} shows up in ${args.eraLabel}: ${stats ? `${stats}. ` : ""}${standout1 ?? ""}`.trim(),
    () =>
      `${args.eraLabel} chapter: ${stats ? `${stats}. ` : ""}${standout1 ?? ""}${
        standout2 ? ` Also: ${runner?.title}.` : ""
      }`.trim(),
    () =>
      `${stats ? `${stats} in ` : ""}${args.eraLabel} — ${flavor}. ${standout1 ?? ""}`.replace(
        /\s+/g,
        " "
      ).trim(),
  ];

  // choose from the right pool, but keep it stable per user+era
  const pool = shouldUsePlatformFallback ? fallbackTemplates : evidenceTemplates;
  const idx = hashToIndex(`${args.seed}|${k}|tpl`, pool.length);
  const out = pool[idx]();

  return out && out.length > 0 ? out : "We're still learning your vibe in this era.";
}
