/**
 * Canonical archetype catalog keyed by archetype key.
 * Used by ArchetypeDetailDrawer and Identity strip. Design tokens for colors (no hex in UI).
 */

export type SignalVerb = "play" | "ownership" | "time" | "curation";

export type ArchetypeCatalogSignal = {
  label: string;
  verb: SignalVerb;
  copy: string;
};

export type TierCopy = {
  emerging: string;
  strong: string;
  core: string;
};

export type ArchetypeCatalogEntry = {
  label: string;
  one_liner: string;
  description: string;
  tier_copy: TierCopy;
  signals: ArchetypeCatalogSignal[];
  icon: string;
  color_token: string;
};

/** Design token names (CSS var or Tailwind). No hex. */
export const ARCHETYPE_COLOR_TOKENS = {
  completionist: "var(--archetype-completionist)",
  explorer: "var(--archetype-explorer)",
  retro_dabbler: "var(--archetype-retro-dabbler)",
  era_early: "var(--archetype-era)",
  era_nes: "var(--archetype-era)",
  era_snes: "var(--archetype-era)",
  era_ps1: "var(--archetype-era)",
  era_ps2: "var(--archetype-era)",
  era_ps3_360: "var(--archetype-era)",
  era_wii: "var(--archetype-era)",
  era_modern: "var(--archetype-era)",
  era_unknown: "var(--archetype-era)",
} as const;

const CATALOG: Record<string, ArchetypeCatalogEntry> = {
  completionist: {
    label: "Completionist",
    one_liner: "You finish what you start.",
    description:
      "You tend to see games through to the end. When you commit to a playthrough, you're more likely than most players to reach credits, final trophies, or end-state milestones.",
    tier_copy: {
      emerging: "You're starting to close the loop on more games than before.",
      strong: "Finishing games is a consistent pattern for you.",
      core: "Completion is a defining part of how you play.",
    },
    signals: [
      { label: "Trophies & achievements", verb: "play", copy: "You frequently complete structured goals." },
      { label: "Play progress", verb: "play", copy: "Many sessions reach late-game states." },
      { label: "Ownership", verb: "ownership", copy: "Owning a game does not imply completion." },
    ],
    icon: "target",
    color_token: ARCHETYPE_COLOR_TOKENS.completionist,
  },
  explorer: {
    label: "Explorer",
    one_liner: "You value discovery over closure.",
    description:
      "You sample widely, follow curiosity, and enjoy seeing what a game has to offer without feeling obligated to finish everything. Breadth matters more than checkmarks.",
    tier_copy: {
      emerging: "You're experimenting more than finishing.",
      strong: "Exploration is your default mode.",
      core: "Your play history is defined by curiosity.",
    },
    signals: [
      { label: "Library diversity", verb: "play", copy: "You touch many different titles and genres." },
      { label: "Platform diversity", verb: "play", copy: "You play across multiple platforms." },
      { label: "Era diversity", verb: "time", copy: "Your library spans multiple eras." },
    ],
    icon: "compass",
    color_token: ARCHETYPE_COLOR_TOKENS.explorer,
  },
  retro_dabbler: {
    label: "Retro Dabbler",
    one_liner: "You keep older eras in play.",
    description:
      "A meaningful share of your library or play is from retro eras. You might use RetroAchievements or revisit classics; retro isn't just nostalgia, it's active play.",
    tier_copy: {
      emerging: "Retro titles are starting to show up more.",
      strong: "Retro play is a clear part of your mix.",
      core: "Retro gaming is a defining part of your identity.",
    },
    signals: [
      { label: "Retro titles in library", verb: "ownership", copy: "You own a notable share of pre-HD titles." },
      { label: "Retro share", verb: "time", copy: "Era distribution skews toward older generations." },
      { label: "RA coverage", verb: "play", copy: "RetroAchievements usage signals active retro play." },
    ],
    icon: "repeat",
    color_token: ARCHETYPE_COLOR_TOKENS.retro_dabbler,
  },
  era_early: {
    label: "Early Home Computing Era Player",
    one_liner: "Your library anchors in the early home computing era.",
    description: "A large share of your collection or play is from the early home computing / Atari era.",
    tier_copy: {
      emerging: "This era is starting to stand out.",
      strong: "You clearly favor this generation.",
      core: "This era defines your gaming history.",
    },
    signals: [
      { label: "Primary era", verb: "time", copy: "Era concentration in early home computing." },
      { label: "Titles in era", verb: "ownership", copy: "Library count in this era." },
      { label: "Era share", verb: "time", copy: "Share of library in this era." },
    ],
    icon: "hourglass",
    color_token: ARCHETYPE_COLOR_TOKENS.era_early,
  },
  era_nes: {
    label: "NES Era Player",
    one_liner: "Your library anchors in the NES era.",
    description: "A large share of your collection or play is from the NES generation.",
    tier_copy: {
      emerging: "This era is starting to stand out.",
      strong: "You clearly favor this generation.",
      core: "This era defines your gaming history.",
    },
    signals: [
      { label: "Primary era", verb: "time", copy: "Era concentration in NES." },
      { label: "Titles in era", verb: "ownership", copy: "Library count in this era." },
      { label: "Era share", verb: "time", copy: "Share of library in this era." },
    ],
    icon: "gamepad-2",
    color_token: ARCHETYPE_COLOR_TOKENS.era_nes,
  },
  era_snes: {
    label: "SNES Era Player",
    one_liner: "Your library anchors in the SNES era.",
    description: "A large share of your collection or play is from the SNES generation.",
    tier_copy: {
      emerging: "This era is starting to stand out.",
      strong: "You clearly favor this generation.",
      core: "This era defines your gaming history.",
    },
    signals: [
      { label: "Primary era", verb: "time", copy: "Era concentration in SNES." },
      { label: "Titles in era", verb: "ownership", copy: "Library count in this era." },
      { label: "Era share", verb: "time", copy: "Share of library in this era." },
    ],
    icon: "gamepad-2",
    color_token: ARCHETYPE_COLOR_TOKENS.era_snes,
  },
  era_ps1: {
    label: "PS1 Era Player",
    one_liner: "Your library anchors in the PS1 era.",
    description: "A large share of your collection or play is from the PlayStation 1 generation.",
    tier_copy: {
      emerging: "This era is starting to stand out.",
      strong: "You clearly favor this generation.",
      core: "This era defines your gaming history.",
    },
    signals: [
      { label: "Primary era", verb: "time", copy: "Era concentration in PS1." },
      { label: "Titles in era", verb: "ownership", copy: "Library count in this era." },
      { label: "Era share", verb: "time", copy: "Share of library in this era." },
    ],
    icon: "gamepad-2",
    color_token: ARCHETYPE_COLOR_TOKENS.era_ps1,
  },
  era_ps2: {
    label: "PS2 Era Player",
    one_liner: "Your library anchors in the PS2 era.",
    description: "A large share of your collection or play is from the PlayStation 2 generation.",
    tier_copy: {
      emerging: "This era is starting to stand out.",
      strong: "You clearly favor this generation.",
      core: "This era defines your gaming history.",
    },
    signals: [
      { label: "Primary era", verb: "time", copy: "Era concentration in PS2." },
      { label: "Titles in era", verb: "ownership", copy: "Library count in this era." },
      { label: "Era share", verb: "time", copy: "Share of library in this era." },
    ],
    icon: "gamepad-2",
    color_token: ARCHETYPE_COLOR_TOKENS.era_ps2,
  },
  era_ps3_360: {
    label: "PS3 / Xbox 360 Era Player",
    one_liner: "Your library anchors in the HD era.",
    description: "A large share of your collection or play is from the PS3 / Xbox 360 generation.",
    tier_copy: {
      emerging: "This era is starting to stand out.",
      strong: "You clearly favor this generation.",
      core: "This era defines your gaming history.",
    },
    signals: [
      { label: "Primary era", verb: "time", copy: "Era concentration in PS3/360." },
      { label: "Titles in era", verb: "ownership", copy: "Library count in this era." },
      { label: "Era share", verb: "time", copy: "Share of library in this era." },
    ],
    icon: "gamepad-2",
    color_token: ARCHETYPE_COLOR_TOKENS.era_ps3_360,
  },
  era_wii: {
    label: "Wii Era Player",
    one_liner: "Your library anchors in the Wii era.",
    description: "A large share of your collection or play is from the Wii generation.",
    tier_copy: {
      emerging: "This era is starting to stand out.",
      strong: "You clearly favor this generation.",
      core: "This era defines your gaming history.",
    },
    signals: [
      { label: "Primary era", verb: "time", copy: "Era concentration in Wii." },
      { label: "Titles in era", verb: "ownership", copy: "Library count in this era." },
      { label: "Era share", verb: "time", copy: "Share of library in this era." },
    ],
    icon: "gamepad-2",
    color_token: ARCHETYPE_COLOR_TOKENS.era_wii,
  },
  era_modern: {
    label: "Modern Era Player",
    one_liner: "Your library anchors in the modern era.",
    description: "A large share of your collection or play is from recent generations.",
    tier_copy: {
      emerging: "This era is starting to stand out.",
      strong: "You clearly favor this generation.",
      core: "This era defines your gaming history.",
    },
    signals: [
      { label: "Primary era", verb: "time", copy: "Era concentration in modern." },
      { label: "Titles in era", verb: "ownership", copy: "Library count in this era." },
      { label: "Era share", verb: "time", copy: "Share of library in this era." },
    ],
    icon: "gamepad-2",
    color_token: ARCHETYPE_COLOR_TOKENS.era_modern,
  },
  era_unknown: {
    label: "Era Player",
    one_liner: "Your library spans multiple eras.",
    description: "Your collection or play doesn't strongly concentrate in a single era yet.",
    tier_copy: {
      emerging: "Era patterns are starting to show.",
      strong: "You have a clear era focus.",
      core: "One era strongly defines your history.",
    },
    signals: [
      { label: "Primary era", verb: "time", copy: "Era distribution." },
      { label: "Titles in era", verb: "ownership", copy: "Library count." },
      { label: "Era share", verb: "time", copy: "Share of library." },
    ],
    icon: "hourglass",
    color_token: ARCHETYPE_COLOR_TOKENS.era_unknown,
  },
};

/** Canonical catalog keyed by archetype key. */
export const ARCHETYPE_CATALOG = CATALOG;

export function getArchetypeCatalogEntry(key: string): ArchetypeCatalogEntry | undefined {
  return CATALOG[key];
}

export function getArchetypeColorToken(key: string): string {
  return getArchetypeCatalogEntry(key)?.color_token ?? "var(--archetype-default)";
}
