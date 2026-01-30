// lib/images/resolveCoverUrl.ts

export type CoverInput = {
    cover_url?: string | null;
    platform_key?: string | null;
    steam_appid?: string | null;
  
    // optional fallbacks you may have available in some contexts
    game_cover_url?: string | null; // game.cover_url fallback
    psn_title_icon_url?: string | null;
    igdb_cover_url?: string | null; // if you already hydrate this somewhere later
  };
  
  function isHttp(url: string) {
    return /^https?:\/\//i.test(url);
  }
  
  function steamHeader(appid: string) {
    // This is the header art you’ve already used successfully
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`;
  }
  
  function platformPlaceholder(platformKey: string | null | undefined) {
    const key = (platformKey ?? "").toLowerCase();
  
    // Keep it simple: you can expand later.
    if (key.includes("steam")) return "/placeholders/platform/steam.png";
    if (key.includes("psn") || key.includes("playstation")) return "/placeholders/platform/psn.png";
    if (key.includes("xbox")) return "/placeholders/platform/xbox.png";
  
    if (key === "snes") return "/placeholders/platform/snes.png";
    if (key === "nes") return "/placeholders/platform/nes.png";
    if (key === "n64") return "/placeholders/platform/n64.png";
    if (key === "gba") return "/placeholders/platform/gba.png";
    if (key === "gb") return "/placeholders/platform/gb.png";
    if (key === "gbc") return "/placeholders/platform/gbc.png";
    if (key === "genesis" || key === "md") return "/placeholders/platform/genesis.png";
  
    return "/placeholders/platform/unknown.png";
  }
  
  /**
   * Check if a cover URL is valid (not unknown.png or placeholder)
   */
  function isValidCoverUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    const u = String(url).trim().toLowerCase();
    return !u.includes("unknown.png") && !u.includes("placeholder");
  }

  /**
   * Cover contract: default from games.cover_url; releases.cover_url is optional override.
   * Ladder: 1) release.cover_url (if valid) 2) game.cover_url 3) Steam header 4) PSN icon 5) IGDB 6) placeholder
   */
  export function resolveCoverUrl(input: CoverInput): string {
    const cover = (input.cover_url ?? "").trim();
    if (cover && isValidCoverUrl(cover)) return cover;
  
    const gameCover = (input.game_cover_url ?? "").trim();
    if (gameCover && isValidCoverUrl(gameCover)) return gameCover;
  
    const appid = (input.steam_appid ?? "").trim();
    if (appid) return steamHeader(appid);
  
    const psnIcon = (input.psn_title_icon_url ?? "").trim();
    if (psnIcon && isHttp(psnIcon)) return psnIcon;
  
    const igdb = (input.igdb_cover_url ?? "").trim();
    if (igdb) return igdb;
  
    return "/images/placeholder-cover.png";
  }
  