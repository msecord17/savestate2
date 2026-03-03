// web/lib/demo/release_demo_editorial.ts

export type DemoReleaseEditorial = {
  tags: string[];
  summary: string;

  timeline: {
    era_label: string;
    released_label: string;
    released_note: string;
    same_year_label: string;
  };

  reputation: {
    score: number | null;
    score_source_label: string | null; // "Metacritic (PS5)" etc
    blurb: string;
    community_chips: string[]; // e.g. ["All-Time Classic", "System Seller"]
    community_note: string;
    legacy_impact: string;
  };

  footnote: {
    title: string;
    body: string;
  };

  release_versions: Array<{
    title: string;
    badge?: string; // "Original", "Definitive", etc
    subtitle: string; // "SNES • 1995"
    body: string;
  }>;

  related_games: Array<{
    title: string;
    reason: string; // "Prequel", "Sequel", "Same Developer", etc
  }>;
};

// ---- matching helpers ----

function norm(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function releaseTitle(release: any) {
  return (
    release?.display_title ||
    release?.games?.canonical_title ||
    release?.games?.title ||
    ""
  );
}

function releasePlatform(release: any) {
  return (release?.platform_name || release?.platform_label || release?.platform_key || "").toString();
}

type Entry = {
  titleIncludes: string[]; // normalized tokens that must appear in title
  platformIncludes?: string[]; // optional normalized tokens
  editorial: DemoReleaseEditorial;
};

function matches(entry: Entry, release: any) {
  const t = norm(releaseTitle(release));
  const p = norm(releasePlatform(release));

  const okTitle = entry.titleIncludes.every((tok) => t.includes(norm(tok)));
  if (!okTitle) return false;

  if (entry.platformIncludes && entry.platformIncludes.length) {
    const okPlat = entry.platformIncludes.some((tok) => p.includes(norm(tok)));
    if (!okPlat) return false;
  }

  return true;
}

// ---- demo pack (your 10 games) ----
//
// Notes:
// - These are *demo* blurbs intended to make the Figma sections feel alive.
// - You can tighten exact dates/scores later once you decide "source of truth" per field.
// - Scores are optional (null allowed). The UI should handle null = "Legacy".

const ENTRIES: Entry[] = [
  {
    titleIncludes: ["pokemon", "yellow"],
    platformIncludes: ["game boy", "gb"],
    editorial: {
      tags: ["RPG", "Monster Collecting", "Handheld", "90s Icon"],
      summary:
        "The anime-flavored remix of Gen 1: Pikachu follows you everywhere, the vibe is more \"Saturday morning\" than Red/Blue, and it became a peak-Pokémania time capsule.",
      timeline: {
        era_label: "Pokémania Handheld Era (1998–2001)",
        released_label: "1998 (JP) • 1999 (NA/EU)",
        released_note:
          "A Gen 1 'director's cut' that blended the TV show's identity into the original formula.",
        same_year_label: "Pokémon Red/Blue's moment went global alongside the late-90s blockbuster wave.",
      },
      reputation: {
        score: 85,
        score_source_label: "Legacy aggregate",
        blurb:
          "A beloved alternate take on Gen 1 that made Pikachu a permanent mascot-level character in the games, not just the box art.",
        community_chips: ["All-Time Classic", "Gen 1 Essential"],
        community_note:
          "Often recommended as the most 'charming' way to experience the original Kanto adventure.",
        legacy_impact:
          "Popularized the 'partner Pokémon' fantasy years before it became a modern series pillar.",
      },
      footnote: {
        title: "The first real \"Pikachu buddy\" game",
        body:
          "Having Pikachu physically follow you around wasn't just cute — it turned your starter into a character with attitude, reactions, and presence. That idea echoes through later entries that lean into companionship as a core fantasy.",
      },
      release_versions: [
        {
          title: "Pokémon Red / Blue",
          badge: "Original",
          subtitle: "Game Boy • 1996–1998",
          body: "The foundational Kanto journey that defined the series' core loop.",
        },
        {
          title: "Pokémon Yellow",
          badge: "Definitive",
          subtitle: "Game Boy • 1998–1999",
          body: "Anime-inspired remix: starter Pikachu, different encounter beats, and extra personality.",
        },
      ],
      related_games: [
        { title: "Pokémon Crystal", reason: "Spiritual Successor" },
        { title: "Pokémon Let's Go Pikachu!", reason: "Modern Reimagining" },
        { title: "Pokémon FireRed / LeafGreen", reason: "Kanto Remake" },
        { title: "Digimon World", reason: "Same Era, Adjacent Vibe" },
      ],
    },
  },

  {
    titleIncludes: ["spider", "man", "remastered"],
    platformIncludes: ["ps5", "playstation 5"],
    editorial: {
      tags: ["Action", "Open World", "Superhero", "AAA"],
      summary:
        "The PS5 remaster of the 2018 hit: improved visuals, 60fps, and the full Peter Parker story that kicked off Insomniac's Spider-Verse.",
      timeline: {
        era_label: "Modern Blockbuster Era (2020s)",
        released_label: "2020",
        released_note:
          "Bundled with Miles Morales Ultimate Edition, bringing the original to PS5 with a visual overhaul.",
        same_year_label: "2020 saw the PS5 launch and a wave of cross-gen releases.",
      },
      reputation: {
        score: 87,
        score_source_label: "Metacritic (PS5)",
        blurb:
          "A polished remaster that made the 2018 classic feel native to the new hardware — ray tracing, 60fps, and the full experience.",
        community_chips: ["Blockbuster Must-Play", "PS5 Showcase"],
        community_note:
          "Often recommended as the best way to play the original before jumping into the sequels.",
        legacy_impact:
          "Part of the Insomniac Spider-Man trilogy that defined PlayStation's first-party action template.",
      },
      footnote: {
        title: "The trilogy's foundation",
        body:
          "Playing Remastered before Miles Morales and Spider-Man 2 gives you the full arc — and the remaster holds up as a proper PS5 experience.",
      },
      release_versions: [
        {
          title: "Marvel's Spider-Man (2018)",
          badge: "Original",
          subtitle: "PlayStation 4 • 2018",
          body: "The original release that started Insomniac's Spider-Verse.",
        },
        {
          title: "Marvel's Spider-Man Remastered",
          badge: "Definitive",
          subtitle: "PlayStation 5 • 2020",
          body: "Visual overhaul, 60fps, and all DLC — the best way to play on PS5.",
        },
      ],
      related_games: [
        { title: "Marvel's Spider-Man: Miles Morales", reason: "Bridge Sequel" },
        { title: "Marvel's Spider-Man 2", reason: "Sequel" },
        { title: "Batman: Arkham City", reason: "Similar Genre DNA" },
        { title: "Infamous Second Son", reason: "Same Platform Vibe" },
      ],
    },
  },

  {
    titleIncludes: ["spider", "man", "2"],
    platformIncludes: ["ps5", "playstation 5"],
    editorial: {
      tags: ["Action", "Open World", "Superhero", "AAA"],
      summary:
        "A modern blockbuster sequel that doubles down on traversal, spectacle, and dual-protagonist pacing — built to feel like a playable summer movie with sharp combat.",
      timeline: {
        era_label: "Modern Blockbuster Era (2020s)",
        released_label: "2023",
        released_note:
          "Arrived in a stacked year for big-budget releases — and still carved out mindshare with pure momentum and polish.",
        same_year_label: "2023's heavy hitters included Baldur's Gate 3 and Alan Wake 2.",
      },
      reputation: {
        score: 90,
        score_source_label: "Metacritic (PS5)",
        blurb:
          "A polished, crowd-pleasing sequel praised for movement feel, set pieces, and the emotional swing between Peter and Miles.",
        community_chips: ["Blockbuster Must-Play", "Traversal King"],
        community_note:
          "The \"swinging feels incredible\" consensus is basically universal — it's the fantasy, delivered.",
        legacy_impact:
          "A poster child for how first-party production values + tight movement design can still define an open-world game in the 2020s.",
      },
      footnote: {
        title: "Two protagonists, one momentum curve",
        body:
          "The best trick here is pacing: swapping perspectives lets the story keep sprinting without burning out one arc. It's less 'open world sprawl' and more 'comic run with chapters.'",
      },
      release_versions: [
        {
          title: "Marvel's Spider-Man 2",
          badge: "Original",
          subtitle: "PlayStation 5 • 2023",
          body: "The flagship sequel with dual protagonists and a bigger set-piece budget.",
        },
      ],
      related_games: [
        { title: "Marvel's Spider-Man (2018)", reason: "Prequel" },
        { title: "Marvel's Spider-Man: Miles Morales", reason: "Bridge Sequel" },
        { title: "Batman: Arkham City", reason: "Similar Genre DNA" },
        { title: "Infamous Second Son", reason: "Same Platform Vibe" },
      ],
    },
  },

  {
    titleIncludes: ["banjo", "kazooie"],
    platformIncludes: ["nintendo 64", "n64"],
    editorial: {
      tags: ["3D Platformer", "Collectathon", "N64 Classic", "Comedy"],
      summary:
        "A playful, joke-packed 3D collectathon with tight worlds, iconic music, and that Rare-era \"everything has a gag\" charm.",
      timeline: {
        era_label: "N64 Collectathon Boom (1997–1999)",
        released_label: "1998",
        released_note:
          "Peak-era Rare: big personality, smart level design, and a soundtrack that sticks.",
        same_year_label: "1998 was a monster year for genre-defining games across the board.",
      },
      reputation: {
        score: 92,
        score_source_label: "Metacritic (N64)",
        blurb:
          "Still held up as one of the best-feeling collectathons — not just 'more stuff,' but better pacing and playful discovery.",
        community_chips: ["N64 Hall-of-Famer", "All-Time Platformer"],
        community_note:
          "Often name-dropped alongside Mario 64 as the 'other' essential N64 3D platformer pillar.",
        legacy_impact:
          "Helped codify the collectathon template — whimsical hubs, chunky objectives, and rewards that feel like toys.",
      },
      footnote: {
        title: "Rare's humor is the secret sauce",
        body:
          "Banjo-Kazooie isn't just platforming — it's comedic timing. NPCs, signs, animations, and even sound effects are all part of the joke delivery system.",
      },
      release_versions: [
        {
          title: "Banjo-Kazooie",
          badge: "Original",
          subtitle: "Nintendo 64 • 1998",
          body: "The classic cartridge-era version with the original look and feel.",
        },
        {
          title: "Banjo-Kazooie (HD)",
          badge: "Re-release",
          subtitle: "Xbox 360 • 2008",
          body: "Smoother presentation and modern convenience while keeping the core intact.",
        },
      ],
      related_games: [
        { title: "Banjo-Tooie", reason: "Sequel" },
        { title: "Super Mario 64", reason: "Same Era, Same Genre" },
        { title: "Donkey Kong 64", reason: "Same Developer" },
        { title: "Spyro the Dragon", reason: "Adjacent Classic" },
      ],
    },
  },

  {
    titleIncludes: ["ken", "griffey", "slugfest"],
    platformIncludes: ["nintendo 64", "n64"],
    editorial: {
      tags: ["Sports", "Baseball", "Arcade", "Multiplayer"],
      summary:
        "Arcade-first baseball: fast games, big swings, and couch multiplayer energy — built for 'one more inning' nights.",
      timeline: {
        era_label: "Late-N64 Sports Party Era (1998–2000)",
        released_label: "1999",
        released_note:
          "A North America-focused baseball title that leaned into fun over sim realism.",
        same_year_label: "1999 delivered both late-gen N64 hits and the dawn of the next hardware wave.",
      },
      reputation: {
        score: null,
        score_source_label: null,
        blurb:
          "Remembered as a 'fun-first' baseball game — less sim, more living-room rivalry.",
        community_chips: ["Couch Multiplayer", "Arcade Sports"],
        community_note:
          "The kind of sports game you play because it's funny when your friend whiffs, not because you're optimizing bullpen rotations.",
        legacy_impact:
          "Part of that late-90s moment where sports games split into two lanes: sim purists vs arcade chaos.",
      },
      footnote: {
        title: "Nintendo-published, arcade attitude",
        body:
          "Even with real rosters and modes, the design priority is obvious: keep the action moving and the inputs approachable for friends who don't live inside sports sims.",
      },
      release_versions: [
        {
          title: "Ken Griffey Jr.'s Slugfest",
          badge: "Original",
          subtitle: "Nintendo 64 • 1999",
          body: "The main event: arcade baseball pacing with multiplayer focus.",
        },
        {
          title: "Ken Griffey Jr.'s Slugfest (GBC)",
          badge: "Portable",
          subtitle: "Game Boy Color • 1999",
          body: "A scaled-down portable version of the same idea.",
        },
      ],
      related_games: [
        { title: "Major League Baseball Featuring Ken Griffey Jr.", reason: "Prequel" },
        { title: "All-Star Baseball 2000", reason: "Same Era, Same Sport" },
        { title: "NBA Hangtime", reason: "Arcade Sports Vibe" },
        { title: "NFL Blitz", reason: "Arcade Sports Vibe" },
      ],
    },
  },

  {
    titleIncludes: ["super", "mario", "world"],
    platformIncludes: ["super nintendo", "snes"],
    editorial: {
      tags: ["Platformer", "16-bit", "Nintendo", "System Seller"],
      summary:
        "The SNES-era Mario blueprint: confident level design, secrets everywhere, and a tone that feels like pure Saturday morning joy — plus Yoshi.",
      timeline: {
        era_label: "16-bit Dawn (1990–1992)",
        released_label: "1990–1991",
        released_note:
          "A defining early SNES era landmark that set expectations for 16-bit polish.",
        same_year_label: "Early 90s gaming was pivoting hard into bigger worlds and better feel.",
      },
      reputation: {
        score: 92,
        score_source_label: "Metacritic (GBA re-release)",
        blurb:
          "One of the most consistently praised platformers ever — built around flow, secrets, and that 'perfect jump arc' feeling.",
        community_chips: ["All-Time Great", "SNES Essential"],
        community_note:
          "Even people who don't 'do platformers' make exceptions for this one.",
        legacy_impact:
          "Introduced Yoshi and helped lock in Nintendo's house style: crisp controls + playful discovery.",
      },
      footnote: {
        title: "Yoshi isn't a gimmick — he's level design",
        body:
          "Yoshi changes how you read levels: enemy interactions, bonus routes, and risk/reward become more expressive. He's not just a mount — he's a new verb.",
      },
      release_versions: [
        {
          title: "Super Mario World",
          badge: "Original",
          subtitle: "Super Nintendo • 1990–1991",
          body: "The classic SNES release and the 'pure' original presentation.",
        },
        {
          title: "Super Mario Advance 2",
          badge: "Portable",
          subtitle: "Game Boy Advance • 2001",
          body: "A portable version that introduced the game to a new generation.",
        },
      ],
      related_games: [
        { title: "Super Mario Bros. 3", reason: "Predecessor DNA" },
        { title: "Yoshi's Island", reason: "Spin-off / Follow-up" },
        { title: "Donkey Kong Country", reason: "Same Era Icon" },
        { title: "Super Mario Maker 2", reason: "Modern Echo" },
      ],
    },
  },

  {
    titleIncludes: ["chrono", "trigger"],
    platformIncludes: ["snes", "super nintendo"],
    editorial: {
      tags: ["JRPG", "Time Travel", "16-bit", "All-Time Classic"],
      summary:
        "A 'dream team' JRPG built around time travel, momentum, and multiple endings — famous for making epic feel fast, not bloated.",
      timeline: {
        era_label: "SNES RPG Peak (1994–1996)",
        released_label: "1995",
        released_note:
          "A landmark JRPG that blended cinematic ambition with relentlessly forward pacing.",
        same_year_label: "1995 was a heavy year for RPGs and genre staples.",
      },
      reputation: {
        score: 92,
        score_source_label: "Metacritic (DS)",
        blurb:
          "Often cited as an all-time great because it respects your time: dense ideas, little filler, and huge emotional range.",
        community_chips: ["All-Time JRPG", "Time Travel Legend"],
        community_note:
          "The 'play it once, remember it forever' pick for a lot of RPG fans.",
        legacy_impact:
          "Helped normalize multiple endings + replay-friendly structure (without feeling like a chore).",
      },
      footnote: {
        title: "New Game+ before it was normal",
        body:
          "Replay wasn't an afterthought — the structure invites you to re-run with knowledge and power, then see how outcomes shift. That idea shows up everywhere now.",
      },
      release_versions: [
        {
          title: "Chrono Trigger",
          badge: "Original",
          subtitle: "Super Nintendo • 1995",
          body: "The original 16-bit release and cultural reference point.",
        },
        {
          title: "Chrono Trigger (DS)",
          badge: "Definitive",
          subtitle: "Nintendo DS • 2008",
          body: "Modernized presentation and added content while preserving the core.",
        },
      ],
      related_games: [
        { title: "Chrono Cross", reason: "Follow-up" },
        { title: "Final Fantasy VI", reason: "Same Era, Same Magic" },
        { title: "Secret of Mana", reason: "Same Era JRPG Icon" },
        { title: "Radiant Historia", reason: "Time Travel JRPG" },
      ],
    },
  },

  {
    titleIncludes: ["goldeneye", "007"],
    platformIncludes: ["nintendo 64", "n64"],
    editorial: {
      tags: ["FPS", "N64", "Multiplayer", "Spy"],
      summary:
        "The console FPS that turned living rooms into battlegrounds — objectives, gadgets, and local multiplayer stories people still tell.",
      timeline: {
        era_label: "N64 Multiplayer Revolution (1996–1998)",
        released_label: "1997",
        released_note:
          "A movie tie-in that transcended the label and became a genre marker for console shooters.",
        same_year_label: "1997 was packed with genre-defining releases across the board.",
      },
      reputation: {
        score: 96,
        score_source_label: "Metacritic (N64)",
        blurb:
          "Still treated as the 'proof' that FPS could work on console — and be a party game at the same time.",
        community_chips: ["FPS Hall-of-Famer", "Couch Multiplayer Myth"],
        community_note:
          "Even people who never finished the campaign remember the multiplayer rules their friend group invented.",
        legacy_impact:
          "Helped shape how console shooters think about controls, objectives, and social play — long before modern online norms.",
      },
      footnote: {
        title: "Screen-peeking diplomacy",
        body:
          "Local multiplayer created a weird meta: you 'shouldn't' look, but everyone does. It's a social contract game as much as a shooter — and that's part of why it lasted.",
      },
      release_versions: [
        {
          title: "GoldenEye 007",
          badge: "Original",
          subtitle: "Nintendo 64 • 1997",
          body: "The iconic cartridge-era release that defined the game's legacy.",
        },
        {
          title: "GoldenEye 007 (Re-release)",
          badge: "Modern",
          subtitle: "Switch / Xbox • 2023",
          body: "A modern-access version that brought the classic back into rotation.",
        },
      ],
      related_games: [
        { title: "Perfect Dark", reason: "Spiritual Successor" },
        { title: "TimeSplitters 2", reason: "Same Vibe" },
        { title: "Halo: Combat Evolved", reason: "Console FPS Lineage" },
        { title: "Metal Gear Solid", reason: "Spy Adjacent Classic" },
      ],
    },
  },

  {
    titleIncludes: ["madden", "97"],
    platformIncludes: ["snes", "super nes", "super nintendo"],
    editorial: {
      tags: ["Sports", "Football", "16-bit", "Franchise"],
      summary:
        "A mid-90s Madden snapshot — faster, simpler, and built around couch seasons with friends (and trash talk).",
      timeline: {
        era_label: "16-bit Sports Era (1994–1997)",
        released_label: "1996",
        released_note:
          "The franchise expanding across hardware generations while keeping the core 'one more game' loop.",
        same_year_label: "1996 was a turning point year as the industry leaned into 3D and new consoles.",
      },
      reputation: {
        score: null,
        score_source_label: null,
        blurb:
          "A 'season on the couch' Madden — less simulation obsession, more immediate play and rivalry energy.",
        community_chips: ["Retro Sports", "Franchise History"],
        community_note:
          "For a lot of players, the 'best Madden' is whichever one their friend group played to death.",
        legacy_impact:
          "Shows the transition era where Madden became a multi-platform institution across console generations.",
      },
      footnote: {
        title: "A franchise in transition",
        body:
          "This era is where sports games start splitting into 'sim realism' vs 'pick-up-and-play.' Retro Maddens are a time capsule of the faster lane.",
      },
      release_versions: [
        {
          title: "Madden NFL 97 (16-bit)",
          badge: "Original",
          subtitle: "SNES / Genesis • 1996",
          body: "The classic 16-bit console-era feel and pacing.",
        },
        {
          title: "Madden NFL 97 (32-bit)",
          badge: "Next Gen",
          subtitle: "PlayStation / Saturn • 1996",
          body: "A generation step toward the later presentation-heavy Maddens.",
        },
      ],
      related_games: [
        { title: "Madden NFL 96", reason: "Prequel" },
        { title: "Madden NFL 98", reason: "Sequel" },
        { title: "NFL Blitz", reason: "Arcade Counterpoint" },
        { title: "Tecmo Super Bowl", reason: "Retro Sports Legend" },
      ],
    },
  },

  {
    titleIncludes: ["sonic", "the", "hedgehog", "2"],
    platformIncludes: ["genesis", "mega drive", "sega"],
    editorial: {
      tags: ["Platformer", "16-bit", "Sega", "Speed"],
      summary:
        "The sequel that turned Sonic into a phenomenon: faster flow, bigger levels, and a new sidekick (Tails) that became part of the brand's heart.",
      timeline: {
        era_label: "Console Wars Peak (1991–1993)",
        released_label: "1992",
        released_note:
          "A defining moment in the Sega vs Nintendo era — marketed like an event and remembered like one.",
        same_year_label: "1992 was stacked with foundational console-era hits.",
      },
      reputation: {
        score: 83,
        score_source_label: "Metacritic (SEGA AGES re-release)",
        blurb:
          "A franchise-defining sequel praised for feel, level variety, and the 'speed as flow' identity.",
        community_chips: ["Genesis Essential", "Series Peak"],
        community_note:
          "A lot of fans consider this the 'pure' Sonic formula before later experiments.",
        legacy_impact:
          "Introduced Tails and the Spin Dash — two changes that shaped Sonic's identity for decades.",
      },
      footnote: {
        title: "Sonic 2 wasn't just bigger — it was an event",
        body:
          "The release was marketed like a cultural moment ('Sonic 2sday' vibes) — and the game delivered enough polish to justify the hype.",
      },
      release_versions: [
        {
          title: "Sonic the Hedgehog 2",
          badge: "Original",
          subtitle: "Genesis / Mega Drive • 1992",
          body: "The classic 16-bit release and the game most associated with peak Sonic momentum.",
        },
        {
          title: "Sonic the Hedgehog 2 (SEGA AGES)",
          badge: "Modern",
          subtitle: "Switch • 2018",
          body: "A modern-access version that keeps the classic feel while improving convenience.",
        },
      ],
      related_games: [
        { title: "Sonic the Hedgehog", reason: "Prequel" },
        { title: "Sonic 3 & Knuckles", reason: "Sequel" },
        { title: "Donkey Kong Country", reason: "16-bit Rival Era" },
        { title: "Mega Man X", reason: "Same Era Icon" },
      ],
    },
  },

  {
    titleIncludes: ["alien", "vs", "predator"],
    platformIncludes: ["jaguar", "atari"],
    editorial: {
      tags: ["FPS", "Sci-Fi Horror", "Cult Classic", "90s Weird"],
      summary:
        "Three campaigns (Alien, Predator, Marine) wrapped in a moody, hardware-limit era FPS — famous for atmosphere and for being a 'you had to be there' Jaguar standout.",
      timeline: {
        era_label: "90s Hardware Wild West (1993–1995)",
        released_label: "1994",
        released_note:
          "A rare Jaguar-era title that people still bring up when talking about 'hidden branches' of FPS history.",
        same_year_label: "1994 was the year gaming culture started sliding into the 3D future in a big way.",
      },
      reputation: {
        score: null,
        score_source_label: null,
        blurb:
          "A cult pick remembered for ambition: multiple perspectives, oppressive mood, and the novelty of playing Predator like a power fantasy.",
        community_chips: ["Cult Classic", "Jaguar Standout"],
        community_note:
          "The kind of game that collectors and retro FPS nerds cite as 'better than it had any right to be.'",
        legacy_impact:
          "A reminder that FPS design evolved through weird side corridors, not just the mainstream hits.",
      },
      footnote: {
        title: "Three games in one cartridge",
        body:
          "The multi-campaign structure wasn't just a bullet point — it changed how the world feels. Alien is tension, Marine is survival, Predator is dominance. Same map, different psychology.",
      },
      release_versions: [
        {
          title: "Alien vs Predator",
          badge: "Original",
          subtitle: "Atari Jaguar • 1994",
          body: "The cult-classic Jaguar release that retro fans keep resurfacing.",
        },
      ],
      related_games: [
        { title: "Doom (1993)", reason: "Genre Anchor" },
        { title: "Quake (1996)", reason: "FPS Evolution" },
        { title: "AvP (PC, 1999)", reason: "Later Reinvention" },
        { title: "System Shock", reason: "Sci-Fi Horror Adjacent" },
      ],
    },
  },
];

export function getDemoReleaseEditorial(release: any): DemoReleaseEditorial | null {
  for (const entry of ENTRIES) {
    if (matches(entry, release)) return entry.editorial;
  }
  // fallback: some titles come through with extra punctuation (e.g. "Pokémon Yellow Version")
  const t = norm(releaseTitle(release));
  for (const entry of ENTRIES) {
    const okTitle = entry.titleIncludes.every((tok) => t.includes(norm(tok)));
    if (okTitle) return entry.editorial;
  }
  return null;
}
