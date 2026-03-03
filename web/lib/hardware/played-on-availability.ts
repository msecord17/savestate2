/**
 * Platform-to-hardware mapping and curated emu list for Played On picker.
 * Returns hardware slugs that match a release's platform_key.
 */

// Curated "Emulated on" hardware slugs (modern handhelds, PC handhelds)
// Match slugs with or without underscores/hyphens
export const EMU_HARDWARE_SLUGS = [
  "analogue-pocket",
  "analogue_pocket",
  "miyoo-mini",
  "miyoo-mini-plus",
  "miyoo_mini",
  "anbernic-rg35xx",
  "anbernic-rg35xx-plus",
  "anbernic-rg-cube",
  "retroid-pocket-3",
  "retroid-pocket-4",
  "retroid_pocket_3",
  "retroid_pocket_4",
  "retroid_pocket_4_pro",
  "steam-deck",
  "steam_deck",
  "rog-ally",
  "rog_ally",
  "ayn_odin_2",
  "ayaneo_pocket_air",
] as const;

/**
 * Platform key patterns that map to hardware slug patterns.
 * Used to fetch "official" hardware for a release.
 */
export function getPlatformSlugPatterns(platformKey: string): RegExp[] {
  const pk = (platformKey || "").toLowerCase().trim();

  if (pk === "retro") {
    return [
      /^nes$/i, /^nintendo\s*entertainment\s*system/i, /\bfamicom\b/i, /family\s*computer/i,
      /^snes$/i, /^super\s*nintendo/i, /\bsnes\b/i, /super\s*famicom/i,
      /nintendo\s*64/i, /\bn64\b/i,
      /sega\s*genesis/i, /mega\s*drive/i,
      /atari\s*jaguar/i,
    ];
  }

  // PlayStation family
  if (/psn|ps4|ps5|ps3|ps2|ps1|psp|psvita|playstation/.test(pk)) {
    return [/^ps[1-5]$/i, /^psp$/i, /^psvita$/i, /playstation/i];
  }

  // Xbox family
  if (/xbox|x360|xone|xsx|seriesx|seriess/.test(pk)) {
    return [/xbox/i, /x360/i, /xone/i, /xsx/i, /series\s*x/i, /series\s*s/i];
  }

  // PC / Steam
  if (pk === "steam" || pk === "pc" || /windows/.test(pk)) {
    return [/steam/i, /steam[_\s-]?deck/i, /^pc$/i, /windows/i];
  }

  // ---------- Retro explicit (THIS fixes NES/SNES/Genesis/N64) ----------
  // SNES first (so "Super Nintendo Entertainment System" doesn't match NES)
  if (/^snes$|super\s*nes|super\s*nintendo|super\s*famicom/.test(pk)) {
    return [
      /^snes$/i,
      /^super\s*nintendo/i,
      /\bsnes\b/i,
      /super\s*famicom/i,
    ];
  }

  // NES (avoid matching "Super Nintendo Entertainment System")
  if (/^nes$|nintendo\s*entertainment\s*system|famicom/.test(pk)) {
    return [
      /^nes$/i,                                  // slug match only
      /^nintendo\s*entertainment\s*system/i,     // must be at start of name
      /\bfamicom\b/i,
      /family\s*computer/i,
    ];
  }

  if (/^n64$|nintendo\s*64/.test(pk)) {
    return [/nintendo\s*64/i, /\bn64\b/i];
  }

  if (/genesis|mega\s*drive|megadrive/.test(pk)) {
    return [/sega\s*genesis/i, /mega\s*drive/i, /megadrive/i, /\bgenesis\b/i];
  }

  if (/jaguar|atari\s*jaguar/.test(pk)) {
    return [/atari\s*jaguar/i, /\bjaguar\b/i];
  }

  // Tight generic fallback: exact match only (avoids prefix collisions)
  const norm = pk.replace(/[^a-z0-9]/g, "");
  if (norm.length >= 3) return [new RegExp(`^${norm}$`, "i")];
  return [];
}
