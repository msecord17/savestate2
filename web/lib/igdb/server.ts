export type IgdbHit = {
    igdb_game_id: number;
    title: string;
    summary: string | null;
    genres: string[];
    developer: string | null;
    publisher: string | null;
    first_release_year: number | null;
    cover_url: string | null;
    /** IGDB category: 0 = main_game, 1 = dlc, 2 = expansion, 3 = bundle, etc. Guardrail: only accept 0. */
    category?: number | null;
  };
  
  function normalizeCover(url: string | null) {
    if (!url) return null;
    // IGDB sometimes returns //images.igdb.com/...
    const u = url.startsWith("//") ? `https:${url}` : url;
    // Prefer a decent size
    return u.replace("t_thumb", "t_cover_big");
  }
  
  // You likely already use these env vars in your IGDB routes.
  // If your project uses different names, tell me what they are and I’ll adjust.
  const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID || process.env.TWITCH_CLIENT_ID;
  const IGDB_ACCESS_TOKEN = process.env.IGDB_ACCESS_TOKEN || process.env.TWITCH_APP_ACCESS_TOKEN;

  /** Slugify for IGDB: lowercase, strip ™®©, & → and, non-alnum → single dash, trim dashes. */
  function slugifyForIgdb(s: string): string {
    return String(s || "")
      .toLowerCase()
      .replace(/™|®|©|\u2122|\u00AE|\u00A9/g, "")
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  /** Short title variants for second-attempt IGDB search (subtitle/edition often returns no results). */
  function shortTitleVariants(t: string): string[] {
    const v: string[] = [];
    const s = String(t || "").trim();
    if (!s) return [];
    v.push(s);
    const beforeColon = s.split(":")[0].trim();
    if (beforeColon && beforeColon !== s) v.push(beforeColon);
    const beforeDash = s.split("-")[0].trim();
    if (beforeDash && beforeDash !== s) v.push(beforeDash);
    const noEdition = s.replace(/\b(edition|remastered|definitive|deluxe|complete|anniversary)\b.*$/gi, "").trim();
    if (noEdition && noEdition !== s) v.push(noEdition);
    return Array.from(new Set(v)).filter(Boolean);
  }

  const IGDB_FIELDS = `
    id,
    name,
    summary,
    first_release_date,
    category,
    genres.name,
    involved_companies.company.name,
    involved_companies.developer,
    involved_companies.publisher,
    cover.url`;

  /** One IGDB search; returns parsed games array or null. */
  async function igdbSearchOne(query: string): Promise<any[] | null> {
    if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) return null;
    const body = `
  search "${query.replaceAll('"', "")}";
  fields ${IGDB_FIELDS};
  limit 10;
  `;
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": IGDB_CLIENT_ID,
        Authorization: `Bearer ${IGDB_ACCESS_TOKEN}`,
        "Content-Type": "text/plain",
      },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok || !Array.isArray(json) || json.length === 0) return null;
    return json;
  }

  /** Fetch one game by IGDB id (for pin-igdb). Returns shaped IgdbHit or null. */
  export async function igdbFetchGameById(igdbGameId: number): Promise<IgdbHit | null> {
    if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN || !Number.isFinite(igdbGameId) || igdbGameId <= 0) return null;
    const body = `
  where id = ${igdbGameId};
  fields ${IGDB_FIELDS};
  limit 1;
  `;
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": IGDB_CLIENT_ID,
        Authorization: `Bearer ${IGDB_ACCESS_TOKEN}`,
        "Content-Type": "text/plain",
      },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok || !Array.isArray(json) || json.length === 0) return null;
    return buildHitFromGame(json[0], String(igdbGameId));
  }

  /** Exact slug match; use when search returns nothing or messy. */
  async function igdbWhereSlug(slug: string): Promise<any[] | null> {
    if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN || !slug) return null;
    const body = `
  where slug = "${String(slug).replaceAll('"', "")}";
  fields ${IGDB_FIELDS};
  limit 1;
  `;
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": IGDB_CLIENT_ID,
        Authorization: `Bearer ${IGDB_ACCESS_TOKEN}`,
        "Content-Type": "text/plain",
      },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok || !Array.isArray(json) || json.length === 0) return null;
    return json;
  }

  function buildHitFromGame(g: any, fallbackTitle: string): IgdbHit {
    const involved = Array.isArray(g?.involved_companies) ? g.involved_companies : [];
    const devCompany =
      involved.find((x: any) => x?.developer)?.company?.name ||
      involved[0]?.company?.name ||
      null;
    const pubCompany =
      involved.find((x: any) => x?.publisher)?.company?.name || null;
    const genres = Array.isArray(g?.genres) ? g.genres.map((x: any) => x?.name).filter(Boolean) : [];
    const year =
      typeof g?.first_release_date === "number"
        ? new Date(g.first_release_date * 1000).getUTCFullYear()
        : null;
    return {
      igdb_game_id: Number(g.id),
      title: String(g.name || fallbackTitle),
      summary: g.summary ? String(g.summary) : null,
      genres,
      developer: devCompany ? String(devCompany) : null,
      publisher: pubCompany ? String(pubCompany) : null,
      first_release_year: year,
      cover_url: normalizeCover(g?.cover?.url ?? null),
      category: g?.category != null ? Number(g.category) : null,
    };
  }

  /** Extract 4-digit year or 2K9/2K10 style or short year (e.g. NHL 22 → 2022) from string; returns null if none. */
  function extractYearFromTitle(s: string): string | null {
    const str = String(s || "").trim();
    const four = str.match(/\b(19|20)\d{2}\b/);
    if (four) return four[0];
    const twoK = str.match(/\b2K(\d{1,2})\b/i);
    if (twoK) return "20" + twoK[1].padStart(2, "0");
    const short = str.match(/\b(\d{2})\b/);
    if (short) {
      const n = parseInt(short[1], 10);
      if (n <= 29) return "20" + short[1];
      return "19" + short[1];
    }
    return null;
  }

  /** Tokenize for overlap: lowercase, split on non-alphanumeric, unique, min length 2. */
  function tokenize(s: string): string[] {
    return Array.from(
      new Set(
        String(s || "")
          .toLowerCase()
          .replace(/™|®|©/g, "")
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 2)
      )
    );
  }

  const EDITION_BUNDLE_PATTERN = /\b(edition|remastered|definitive|deluxe|complete|anniversary|bundle|collection|pack|goty|game of the year)\b/i;

  /** IGDB category: 0=main_game, 1=dlc_addon, 2=expansion, 3=bundle, 7=season, 8=remake, 9=remaster, 11=port, 13=pack. */
  const CATEGORY_PREFERRED = new Set([0, 8, 9, 11]); // MAIN_GAME, REMASTER, REMAKE, PORT
  const CATEGORY_PENALIZED = new Set([1, 2, 3, 7, 13]); // DLC_ADDON, EXPANSION, BUNDLE, SEASON, PACK
  const TITLE_DLC_PACK_BUNDLE_SEASON = /\b(dlc|pack|bundle|season)\b/i;

  /**
   * Score a single candidate for matching (deterministic): normalized title similarity (token overlap),
   * year closeness, edition/bundle penalty, category preference/penalty, optional tiny platform hint.
   * Returns 0..1. Used by pickBestCandidate — never "first result wins".
   */
  export function scoreCandidateForMatch(
    rawTitle: string,
    cleanedTitle: string,
    candidateName: string,
    yearHint?: number | null,
    hit?: IgdbHit,
    platformHint?: string
  ): number {
    const queryTokens = tokenize(cleanedTitle || rawTitle);
    const nameTokens = tokenize(String(candidateName || ""));
    if (queryTokens.length === 0) return 0;
    let overlap = 0;
    for (const t of queryTokens) {
      if (nameTokens.includes(t)) overlap++;
    }
    let score = overlap / queryTokens.length;

    if (yearHint != null && Number.isFinite(yearHint)) {
      const candidateYear = extractYearFromTitle(candidateName);
      if (candidateYear) {
        const y = parseInt(candidateYear, 10);
        const diff = Math.abs(y - yearHint);
        if (diff === 0) score += 0.15;
        else if (diff <= 1) score += 0.08;
        else if (diff <= 2) score += 0.04;
      }
    }
    score = Math.min(1, score);

    const rawHasEdition = EDITION_BUNDLE_PATTERN.test(String(rawTitle));
    const candidateHasEdition = EDITION_BUNDLE_PATTERN.test(String(candidateName));
    if (rawHasEdition !== candidateHasEdition) score -= 0.2;

    if (hit?.category != null) {
      const cat = Number(hit.category);
      if (CATEGORY_PREFERRED.has(cat)) score += 0.05;
      else if (CATEGORY_PENALIZED.has(cat)) {
        const rawHasDlcPack = TITLE_DLC_PACK_BUNDLE_SEASON.test(String(rawTitle));
        if (!rawHasDlcPack) score -= 0.25;
      }
    }

    if (platformHint && candidateName) {
      const p = String(platformHint).toLowerCase();
      const nameLower = String(candidateName).toLowerCase();
      const platformMatch =
        (p === "steam" && nameLower.includes("steam")) ||
        (p === "psn" && (nameLower.includes("playstation") || nameLower.includes("ps4") || nameLower.includes("ps5"))) ||
        (p === "xbox" && nameLower.includes("xbox"));
      if (platformMatch) score += 0.02;
    }
    return Math.max(0, score);
  }

  export type PickBestResult =
    | { status: "auto_matched"; candidate: IgdbHit; score: number; scored: Array<{ hit: IgdbHit; score: number }> }
    | { status: "needs_review"; score: number; scored: Array<{ hit: IgdbHit; score: number }> }
    | { status: "unmatched"; scored: Array<{ hit: IgdbHit; score: number }> };

  /** Fail closed: only write igdb_game_id/cover_url when confidence >= 0.84. Below: queue for review, do not write. */
  const AUTO_MATCH_THRESHOLD = 0.84;
  const NEEDS_REVIEW_THRESHOLD = 0.65;

  /**
   * Pick best candidate from IGDB hits: score each deterministically (title similarity, year closeness, category, optional platform hint), then apply thresholds.
   * best >= 0.84 => auto_matched; 0.65–0.84 => needs_review (do not set igdb_game_id); else unmatched.
   * Never "first result wins" — always sort by score.
   */
  export function pickBestCandidate(
    candidates: IgdbHit[],
    rawTitle: string,
    cleanedTitle: string,
    yearHint?: number | null,
    platformHint?: string | null
  ): PickBestResult {
    if (candidates.length === 0) return { status: "unmatched", scored: [] };
    const scored = candidates.map((hit) => ({
      hit,
      score: scoreCandidateForMatch(rawTitle, cleanedTitle, hit.title, yearHint ?? hit.first_release_year ?? undefined, hit, platformHint ?? undefined),
    }));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (!best) return { status: "unmatched", scored };
    if (best.score >= AUTO_MATCH_THRESHOLD)
      return { status: "auto_matched", candidate: best.hit, score: best.score, scored };
    if (best.score >= NEEDS_REVIEW_THRESHOLD)
      return { status: "needs_review", score: best.score, scored };
    return { status: "unmatched", scored };
  }

  export type IgdbSearchBestResult = {
    hit: IgdbHit | null;
    confidence: number;
    candidates: Array<{ hit: IgdbHit; score: number }>;
  };

  /**
   * Return best match with confidence and all scored candidates.
   * Uses igdbSearchCandidates(limit 10) then scores deterministically — never "first result wins".
   * hit = top candidate by score; confidence = its score; candidates = full scored list (sorted by score desc).
   */
  export async function igdbSearchBest(
    title: string,
    options?: { rawTitle?: string; useGameTitleAlias?: boolean; platformHint?: string },
    admin?: { from: (t: string) => any }
  ): Promise<IgdbSearchBestResult> {
    const rawTitle = options?.rawTitle ?? title;
    const cleaned = cleanTitleForIgdb(rawTitle);
    const yearHint = extractYearFromTitle(rawTitle) ? parseInt(extractYearFromTitle(rawTitle)!, 10) : undefined;

    let searchTitle = title;
    if (options?.useGameTitleAlias && admin) {
      const aliasTitle = await resolveGameTitleAlias(admin, rawTitle);
      if (aliasTitle) searchTitle = aliasTitle;
    }

    const rawHits = await igdbSearchCandidates(searchTitle, { rawTitle, limit: 10 });
    const result = pickBestCandidate(rawHits, rawTitle, cleaned || rawTitle, yearHint, options?.platformHint ?? undefined);
    const scored = "scored" in result ? result.scored : [];
    const best = scored[0];
    return {
      hit: best?.hit ?? null,
      confidence: best?.score ?? 0,
      candidates: scored,
    };
  }

  /** Internal: fetch top N IGDB hits (no scoring). Used by igdbSearchCandidates. */
  async function igdbSearchBestRaw(title: string, rawTitle: string, limit = 10): Promise<IgdbHit[]> {
    return igdbSearchCandidates(title, { rawTitle, limit });
  }

  /** Backward compat: return single best match only when auto_matched, else null. Use when caller needs one IgdbHit without committing. */
  export async function igdbSearchBestSingle(
    title: string,
    options?: { rawTitle?: string; useGameTitleAlias?: boolean },
    admin?: { from: (t: string) => any }
  ): Promise<IgdbHit | null> {
    const rawTitle = options?.rawTitle ?? title;
    const { hit, confidence } = await igdbSearchBest(title, options, admin);
    if (hit && confidence >= AUTO_MATCH_THRESHOLD) return hit;
    return null;
  }

  /** Return multiple IGDB candidates (no commit). Used by match-validation layer to score and filter before writing. */
  export async function igdbSearchCandidates(
    title: string,
    options?: { rawTitle?: string; limit?: number }
  ): Promise<IgdbHit[]> {
    if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) return [];
    const rawTitle = options?.rawTitle ?? title;
    const limit = Math.min(options?.limit ?? 10, 20);
    const tried = buildIgdbQueryCandidates(rawTitle);
    for (const q of tried) {
      const body = `
search "${q.replaceAll('"', "")}";
fields ${IGDB_FIELDS};
limit ${limit};
`;
      const res = await fetch("https://api.igdb.com/v4/games", {
        method: "POST",
        headers: {
          "Client-ID": IGDB_CLIENT_ID,
          Authorization: `Bearer ${IGDB_ACCESS_TOKEN}`,
          "Content-Type": "text/plain",
        },
        body,
        cache: "no-store",
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;
      if (res.ok && Array.isArray(json) && json.length) {
        return json.map((g: any) => buildHitFromGame(g, title));
      }
    }
    const slug = slugifyForIgdb(cleanTitleForIgdb(rawTitle));
    if (slug) {
      const slugResult = await igdbWhereSlug(slug);
      if (Array.isArray(slugResult) && slugResult.length > 0) {
        return slugResult.map((g: any) => buildHitFromGame(g, title));
      }
    }
    return [];
  }

  /** Strip ™ ® © and unicode variants (U+2122, U+00AE, U+00A9, etc.) for identity/search. */
  function stripTrademarkUnicode(s: string) {
    return String(s || "")
      .replace(/™|®|©|\u2122|\u00AE|\u00A9|\u24B8|\u24C7/g, "") // ™®© and unicode variants
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Selective de-mash: keep 2K(\d+) as a single token; split known phrases (TigerWoodsPGA, PGATOUR) and camelCase.
   * Order: collapse "2 K 10" → "2K10", protect 2K\d with placeholder, run known mashes, then camelCase/digit splits, then restore 2K.
   */
  function deMashTitle(s: string) {
    const P = "\uE000";
    const Q = "\uE001";
    const t = String(s || "");

    const collapse2K = t.replace(/\b2\s*K\s*(\d{1,2})\b/gi, "2K$1");
    const protected2K = collapse2K
      .replace(/2K\s*(\d{1,2})\b/gi, P + "$1" + Q)
      .replace(/([A-Za-z])2K\s*(\d{1,2})(?=\s|$|[^0-9])/gi, (_, letter, num) => letter + " " + P + num + Q);

    const knownMashes = splitKnownMashes(protected2K);

    const spaced = knownMashes
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
      .replace(/([A-Za-z])(\d)/g, "$1 $2")
      .replace(/(\d)([A-Za-z])/g, "$1 $2");

    return spaced
      .replace(/\uE000(\d{1,2})\uE001/gi, "2K$1")
      .replace(/\b2 K (\d{1,2})\b/gi, "2K$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Known franchise/phrase mashes: split so IGDB search matches. Run inside deMash before generic camelCase so 2K10 stays intact. */
  function splitKnownMashes(s: string) {
    return (s || "")
      .replace(/RainbowSix/gi, "Rainbow Six")
      .replace(/TigerWoodsPGA/gi, "Tiger Woods PGA")
      .replace(/PGATOUR/gi, "PGA Tour")
      .replace(/StreetFighter/gi, "Street Fighter")
      .replace(/TombRaider/gi, "Tomb Raider")
      .replace(/GhostRecon/gi, "Ghost Recon")
      .replace(/SuperStreetFighter/gi, "Super Street Fighter");
  }

  function normalizeSeparators(s: string) {
    return String(s || "")
      .replace(/[•·∙]/g, " ") // Disney•Pixar
      .replace(/[–—]/g, "-") // normalize dashes
      .replace(/&/g, " and ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toTitleCaseLoose(s: string) {
    if (!s) return s;
    const hasLower = /[a-z]/.test(s);
    if (hasLower) return s;
    return s.toLowerCase().replace(/\b[a-z]/g, (m) => m.toUpperCase());
  }

  function stripPlatformSuffixes(s: string) {
    return s
      .replace(/\b(PS5|PS4|PS3|PS2|PS1|PSX|PS Vita|Vita)\b/gi, " ")
      .replace(/\b(Xbox Series X\|S|Series X\|S|Xbox One|Xbox 360|Xbox)\b/gi, " ")
      .replace(/\b(PC|Steam)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripBrandPrefixes(s: string) {
    return s
      .replace(/^\s*EA\s*SPORTS?\s+/i, "")
      .replace(/^\s*TC'?s\s+/i, "")
      .trim();
  }

  function normalizeEditionWords(s: string) {
    return s
      .replace(/\bGOTY\b/gi, "Game of the Year")
      .replace(/\b(Edition)\b/gi, "Edition")
      .trim();
  }

  function expandCommonAbbrevs(s: string) {
    let out = String(s || "");
    out = out.replace(/\bgta\b/gi, "grand theft auto");
    out = out.replace(/\bult\.\b/gi, "ultimate");
    out = out.replace(/\bpgatour\b/gi, "pga tour"); // helps TigerWoodsPGATOUR07
    return out;
  }

  // Optional: handle roman numeral ranges like I-III in titles (Tomb Raider I-III...)
  function normalizeRomanRanges(s: string) {
    return String(s || "")
      .replace(/\bI\s*-\s*III\b/gi, "1-3")
      .replace(/\bII\s*-\s*III\b/gi, "2-3")
      .replace(/\bI\b/g, "1") // conservative; you can omit if too risky
      .replace(/\bII\b/g, "2")
      .replace(/\bIII\b/g, "3");
  }

  /** Expansion for search only (canonical title comes from IGDB hit or raw). */
  export function expandCommonAbbrevsForSearch(s: string) {
    return (s || "")
      .replace(/\bTC'?s\b/gi, "Tom Clancy's")
      .replace(/\bTMNT\b/gi, "Teenage Mutant Ninja Turtles")
      .replace(/\bUlt\.\b/gi, "Ultimate")
      .replace(/\bGTA\b/gi, "Grand Theft Auto")
      .replace(/\bOOTS\b/gi, "Out of the Shadows")
      .replace(/\bFS\b/gi, "Future Soldier")
      .replace(/\bTFD\b/gi, "The 40th Day");
  }

  export function cleanTitleForIgdb(title: string) {
    const base = deMashTitle(stripTrademarkUnicode(String(title || "")));
    const split = splitKnownMashes(normalizeSeparators(base));
    const expanded = expandCommonAbbrevs(normalizeRomanRanges(split));

    return stripPlatformSuffixes(expanded)
      .replace(/\(.*?\)/g, " ") // remove (PlayStation)
      .replace(/\[.*?\]/g, " ")
      // Remove common "edition/bundle" tails for search
      .replace(/:\s*(campaign edition).*/i, "") // Halo 3: ODST Campaign Edition
      .replace(/:\s*(tfd)\b/i, "") // Army of TWO: TFD
      .replace(/\b(x[- ]?factor edition)\b/gi, " ") // NHL 22 X-Factor Edition
      .replace(/\bstarring\b.*$/i, "") // Tomb Raider ... Starring Lara Croft
      .replace(/\b(remastered|definitive|ultimate|complete|anniversary|edition)\b.*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Build a small set of candidate queries for IGDB search, best-first. */
  export function buildIgdbQueryCandidates(rawTitle: string): string[] {
    const raw = String(rawTitle || "").trim();
    if (!raw) return [];

    const base = cleanTitleForIgdb(raw);
    const candidates = new Set<string>();

    candidates.add(base);
    candidates.add(stripPlatformSuffixes(base));
    candidates.add(stripBrandPrefixes(stripPlatformSuffixes(base)));
    candidates.add(normalizeEditionWords(stripBrandPrefixes(stripPlatformSuffixes(base))));
    candidates.add(toTitleCaseLoose(normalizeEditionWords(stripBrandPrefixes(stripPlatformSuffixes(base)))));

    return Array.from(candidates)
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter(Boolean);
  }

  /** Punctuation variants for IGDB search: Jr.s/Jr.'s → Jr's, drop apostrophes, drop abbreviation periods. */
  function titleVariantsForIgdb(s: string): string[] {
    const base = String(s || "").trim();
    if (!base) return [];
    const v = new Set<string>();
    v.add(base);
    v.add(base.replace(/\bJr\.?s\b/gi, "Jr's"));
    v.add(base.replace(/\bJr\.'s\b/gi, "Jr's"));
    v.add(base.replace(/[''\u2019]/g, ""));
    v.add(base.replace(/\bJr\.\b/gi, "Jr"));
    return Array.from(v).filter(Boolean);
  }

  /** Extra cleaning for Xbox titles before IGDB search: platform cruft, storefront packaging, PS suffixes, separators, de-mash. */
  export function cleanTitleForXboxIgdb(title: string) {
    return cleanTitleForIgdb(title)
      .replace(/\b(xbox one|xbox series x|xbox series s|series x|series s|xbox)\b/gi, " ")
      .replace(/\b(bundle|pack|add[- ]on|dlc)\b/gi, " ")
      .replace(/\b(ps5|ps4|ps[45])\b/gi, " ")
      .replace(/[•·∙]/g, " ")
      .replace(/[–—]/g, "-")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Za-z])(\d)/g, "$1 $2")
      .replace(/(\d)([A-Za-z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Canonical normalization (dedupe identity): strip ™®©, normalize punctuation (curly apostrophe → straight, Jr.s/Jr.'s → Jr's), collapse whitespace. */
  export function normalizeCanonicalTitle(s: string) {
    return stripTrademarkUnicode(String(s || "").trim())
      .replace(/\u2019/g, "'")
      .replace(/\bJr\.?'?s\b/gi, "Jr's")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Spine rule: do not overwrite good art.
   * Only overwrite when: cover is null/placeholder/known-bad AND (no images_source or images_source not igdb%).
   * If games.cover_url IS NOT NULL and images_source LIKE 'igdb%' → never overwrite.
   */
  export function shouldOverwriteCover(
    current: string | null | undefined,
    imagesSource?: string | null
  ): boolean {
    if (!current) return true;
    if (imagesSource && /^igdb/i.test(String(imagesSource))) return false;
    const u = String(current).trim().toLowerCase();
    return u.includes("unknown.png") || u.includes("placeholder");
  }

  /**
   * Ignore list for non-games (apps, demos, utilities). Skip IGDB search/backfill when title matches.
   * Tune over time. Case-insensitive.
   */
  const NON_GAME_PATTERN = /\b(amazon|netflix|hulu|spotify|iheartradio|movies|tv|groove|app|demo|trial|beta|pack|add-on|dlc|soundtrack)\b|add\s+on|season\s+pass/i;

  export function isLikelyNonGame(title: string): boolean {
    const s = String(title || "").trim().toLowerCase();
    return NON_GAME_PATTERN.test(s);
  }

  /**
   * Xbox-specific non-game ignore list. Prevents apps (Movies & TV, Groove, Amazon Instant Video, iHeartRadio, etc.)
   * from entering game identity. When platform is xbox and title matches, skip IGDB and tag content_type='app'.
   */
  const XBOX_NON_GAME_PATTERN = /\b(iheartradio|movies\s*&\s*tv(\s+and\s+groove)?|amazon\s+instant\s+video|netflix|hulu|spotify|groove\s+music|movies\s+&\s+tv|instant\s+video|ea\s+play\s+hub|ign\s+app|ign\s+video|peacock|hbomax|max\s+streaming|youtube\s+tv|sling\s+tv|pluto\s+tv|tubi|vudu|crunchyroll|funimation|twitch\s+app|groove)\b|amazon\s+instant|^\s*ign\s*$/i;

  /** True if title looks like an Xbox app (not a game). Use to set content_type='app' and exclude from identity. */
  export function isXboxNonGame(title: string): boolean {
    const s = String(title || "").trim().toLowerCase();
    return XBOX_NON_GAME_PATTERN.test(s) || isLikelyNonGame(title);
  }

  async function resolveAlias(admin: any, platformKey: string, rawTitle: string) {
    const { data } = await admin
      .from("title_aliases")
      .select("search_title")
      .eq("platform_key", platformKey)
      .eq("raw_title", rawTitle)
      .maybeSingle();

    return data?.search_title ? String(data.search_title) : null;
  }

  /**
   * Optional lookup-first: resolve raw title via game_title_aliases to a search_title for IGDB.
   * Use when opts.useGameTitleAlias is true. Table: game_title_aliases (raw_title, canonical_title, search_title).
   */
  export async function resolveGameTitleAlias(
    admin: { from: (t: string) => any },
    rawTitle: string
  ): Promise<string | null> {
    const normalized = normalizeCanonicalTitle(rawTitle);
    const { data: byRaw } = await admin
      .from("game_title_aliases")
      .select("search_title")
      .eq("raw_title", rawTitle)
      .maybeSingle();
    if (byRaw?.search_title) return String(byRaw.search_title);
    const { data: byCanonical } = await admin
      .from("game_title_aliases")
      .select("search_title")
      .eq("canonical_title", normalized)
      .maybeSingle();
    return byCanonical?.search_title ? String(byCanonical.search_title) : null;
  }

  /**
   * Get or create games row: IGDB-first (by igdb_game_id), fallback upsert by canonical_title.
   * Spine: (1) If (platform_key, external_id) present, check igdb_match_overrides first; if found use that igdb_game_id and mark attempt = override_used.
   * (2) Else run candidate search + scoring. If best confidence >= threshold: write igdb_game_id + cover_url.
   * (3) Else: write nothing IGDB-related, insert into igdb_match_review_queue, mark attempt = low_confidence.
   * Always insert a row into igdb_match_attempts for audit.
   */
  export async function upsertGameIgdbFirst(
    admin: { from: (t: string) => any },
    titleName: string,
    opts?: {
      platform?: string;
      platform_key?: string;
      useGameTitleAlias?: boolean;
      source?: string;
      external_id?: string;
      release_id?: string;
    }
  ): Promise<{ game_id: string; igdb_game_id: number | null }> {
    const raw = String(titleName || "").trim();
    if (!raw) throw new Error("titleName empty");

    const canonicalNorm = normalizeCanonicalTitle(raw);
    const { data: existingByTitle, error: earlyErr } = await admin
      .from("games")
      .select("id, igdb_game_id")
      .eq("canonical_title", canonicalNorm)
      .maybeSingle();
    if (!earlyErr && existingByTitle?.id && existingByTitle.igdb_game_id != null) {
      return { game_id: String(existingByTitle.id), igdb_game_id: Number(existingByTitle.igdb_game_id) };
    }

    const platformKey = opts?.platform_key ?? opts?.source ?? "catalog";
    const matchNow = new Date().toISOString();

    // 1) If (platform_key, external_id) present, check igdb_match_overrides first
    if (opts?.platform_key != null && opts?.external_id != null) {
      const { data: overrideRow } = await admin
        .from("igdb_match_overrides")
        .select("igdb_game_id")
        .eq("platform_key", opts.platform_key)
        .eq("external_id", String(opts.external_id))
        .maybeSingle();
      if (overrideRow?.igdb_game_id != null) {
        const overrideIgdbId = Number(overrideRow.igdb_game_id);
        const meta = await igdbFetchGameById(overrideIgdbId);
        const { data: existingTitleRow, error: tErr } = await admin
          .from("games")
          .select("id")
          .eq("canonical_title", canonicalNorm)
          .maybeSingle();
        if (tErr) throw new Error(`game lookup canonical_title: ${tErr.message}`);
        let gameId: string;
        if (existingTitleRow?.id) {
          gameId = String(existingTitleRow.id);
        } else {
          const { data: inserted, error: insErr } = await admin
            .from("games")
            .insert({ canonical_title: canonicalNorm, updated_at: matchNow })
            .select("id")
            .single();
          if (insErr && (insErr as any)?.code === "23505") {
            const { data: raced } = await admin.from("games").select("id").eq("canonical_title", canonicalNorm).maybeSingle();
            if (raced?.id) gameId = String(raced.id);
            else throw new Error(`game insert: ${insErr.message}`);
          } else if (insErr) throw new Error(`game insert: ${insErr.message}`);
          else gameId = String(inserted.id);
        }
        const canonical = meta ? normalizeCanonicalTitle(String(meta.title || raw).trim() || raw) : canonicalNorm;
        const patch: Record<string, unknown> = {
          igdb_game_id: overrideIgdbId,
          canonical_title: canonical,
          updated_at: matchNow,
          match_status: "override",
          match_method: "override",
          matched_at: matchNow,
        };
        if (meta?.summary != null) patch.summary = meta.summary;
        if (meta?.developer != null) patch.developer = meta.developer;
        if (meta?.publisher != null) patch.publisher = meta.publisher;
        if (meta?.first_release_year != null) patch.first_release_year = meta.first_release_year;
        if (Array.isArray(meta?.genres) && meta.genres.length) patch.genres = meta.genres;
        if (meta?.cover_url) patch.cover_url = meta.cover_url;
        if (meta?.category != null) patch.igdb_category = meta.category;
        const { data: otherGame } = await admin.from("games").select("id").eq("igdb_game_id", overrideIgdbId).neq("id", gameId).maybeSingle();
        if (otherGame?.id) await admin.from("games").update({ igdb_game_id: null, updated_at: matchNow }).eq("id", otherGame.id);
        const { data: gameRow } = await admin.from("games").select("cover_url").eq("id", gameId).single();
        if (gameRow?.cover_url && !shouldOverwriteCover(gameRow.cover_url)) delete patch.cover_url;
        await admin.from("games").update(patch).eq("id", gameId);
        await admin.from("igdb_match_attempts").insert({
          platform_key: opts.platform_key,
          external_id: String(opts.external_id),
          release_id: opts?.release_id ?? null,
          raw_title: raw,
          cleaned_title: cleanTitleForIgdb(raw),
          candidates: null,
          chosen_igdb_game_id: overrideIgdbId,
          confidence: null,
          result: "override_used",
          reason: null,
        });
        return { game_id: gameId, igdb_game_id: overrideIgdbId };
      }
    }

    // Alias resolution before IGDB: if platform_key set (e.g. xbox), use title_aliases.search_title for lookup; else fall back to raw
    const alias = opts?.platform_key ? await resolveAlias(admin, opts.platform_key, raw) : null;
    const cleaned = cleanTitleForIgdb(alias ?? raw);
    const expanded = expandCommonAbbrevsForSearch(cleaned);

    // Skip IGDB entirely for known non-games (apps); canonical_title stays from IGDB hit when we get one
    const xboxIgnored = opts?.platform_key === "xbox" && isXboxNonGame(raw);
    if (xboxIgnored) {
      console.warn("[XBOX_IGNORED] Skipping IGDB for known app/non-game:", raw);
    }

    const searchQuery = expanded || cleaned || raw;
    const { hit: bestHit, confidence, candidates: scored } = xboxIgnored || isLikelyNonGame(raw) || !searchQuery
      ? { hit: null as IgdbHit | null, confidence: 0, candidates: [] as Array<{ hit: IgdbHit; score: number }> }
      : await igdbSearchBest(searchQuery, { rawTitle: raw, useGameTitleAlias: opts?.useGameTitleAlias, platformHint: platformKey }, admin);

    const result: PickBestResult = bestHit
      ? confidence >= AUTO_MATCH_THRESHOLD
        ? { status: "auto_matched", candidate: bestHit, score: confidence, scored }
        : confidence >= NEEDS_REVIEW_THRESHOLD
          ? { status: "needs_review", score: confidence, scored }
          : { status: "unmatched", scored }
      : { status: "unmatched", scored };

    const matchDebug = (res: PickBestResult) =>
      "scored" in res && res.scored.length
        ? res.scored.map((s) => ({ igdb_game_id: s.hit.igdb_game_id, name: s.hit.title, score: s.score }))
        : null;

    const normalizedRaw = normalizeCanonicalTitle(raw);
    const source = opts?.source ?? opts?.platform_key ?? "catalog";

    // Get or create game by title so we have game_id for match registry and for gating writes
    const { data: existingTitleRow, error: tErr } = await admin
      .from("games")
      .select("id")
      .eq("canonical_title", normalizedRaw)
      .maybeSingle();
    if (tErr) throw new Error(`game lookup canonical_title: ${tErr.message}`);
    let gameId: string;
    if (existingTitleRow?.id) {
      gameId = String(existingTitleRow.id);
    } else {
      const { data: inserted, error: insErr } = await admin
        .from("games")
        .insert({ canonical_title: normalizedRaw, updated_at: matchNow })
        .select("id")
        .single();
      if (insErr && (insErr as any)?.code === "23505") {
        const { data: raced } = await admin.from("games").select("id").eq("canonical_title", normalizedRaw).maybeSingle();
        if (raced?.id) gameId = String(raced.id);
        else throw new Error(`game insert: ${insErr.message}`);
      } else if (insErr) throw new Error(`game insert: ${insErr.message}`);
      else gameId = String(inserted.id);
    }

    if (result.status === "auto_matched" && result.candidate?.igdb_game_id) {
      const hit = result.candidate;
      const igdbId = Number(hit.igdb_game_id);

      const { data: matchRow, error: matchInsErr } = await admin
        .from("game_matches")
        .insert({
          game_id: gameId,
          source,
          source_title: raw,
          source_external_id: opts?.external_id ?? null,
          igdb_game_id: igdbId,
          status: "proposed",
          confidence: result.score,
          match_debug: matchDebug(result),
          updated_at: matchNow,
        })
        .select("id")
        .single();

      if (matchInsErr) {
        console.warn("[game_matches] insert failed:", matchInsErr.message);
      }

      if (confidence >= AUTO_MATCH_THRESHOLD && matchRow?.id) {
        await admin.from("game_matches").update({ status: "rejected", updated_at: matchNow }).eq("game_id", gameId).eq("status", "accepted");
        await admin.from("game_matches").update({ status: "accepted", resolved_at: matchNow, resolved_by: "auto", updated_at: matchNow }).eq("id", matchRow.id);

        const canonical = normalizeCanonicalTitle(String(hit.title || raw).trim() || raw);
        const patch: any = {
          igdb_game_id: igdbId,
          canonical_title: canonical,
          updated_at: matchNow,
          match_status: "auto_matched",
          match_confidence: result.score,
          match_method: "igdb_search",
          match_query: searchQuery || null,
          match_debug: matchDebug(result),
          matched_at: matchNow,
        };
        if (hit.summary != null) patch.summary = hit.summary;
        if (hit.developer != null) patch.developer = hit.developer;
        if (hit.publisher != null) patch.publisher = hit.publisher;
        if (hit.first_release_year != null) patch.first_release_year = hit.first_release_year;
        if (Array.isArray(hit.genres) && hit.genres.length) patch.genres = hit.genres;
        if (hit.cover_url) patch.cover_url = hit.cover_url;
        if (hit.category != null) patch.igdb_category = hit.category;

        const { data: otherGame } = await admin.from("games").select("id").eq("igdb_game_id", igdbId).neq("id", gameId).maybeSingle();
        if (otherGame?.id) {
          await admin.from("games").update({ igdb_game_id: null, updated_at: matchNow }).eq("id", otherGame.id);
        }
        const { data: gameRow } = await admin.from("games").select("cover_url").eq("id", gameId).single();
        if (gameRow?.cover_url && !shouldOverwriteCover(gameRow.cover_url)) delete patch.cover_url;
        const { error: updErr } = await admin.from("games").update(patch).eq("id", gameId);
        if (updErr) throw new Error(`game update igdb_game_id: ${updErr.message}`);
        await admin.from("igdb_match_attempts").insert({
          platform_key: platformKey,
          external_id: opts?.external_id ?? null,
          release_id: opts?.release_id ?? null,
          raw_title: raw,
          cleaned_title: cleaned || raw,
          candidates: matchDebug(result),
          chosen_igdb_game_id: igdbId,
          confidence: result.score,
          result: "matched",
          reason: null,
        });
        return { game_id: gameId, igdb_game_id: igdbId };
      }
    }

    // needs_review or unmatched: do NOT set igdb_game_id; write nothing IGDB-related when below threshold; queue and mark attempt
    const status = result.status === "needs_review" ? "needs_review" : "unmatched";
    const gamesPatch: any = {
      match_status: status,
      match_confidence: result.status === "needs_review" ? result.score : null,
      match_method: scored.length ? "igdb_search" : null,
      match_query: searchQuery || null,
      match_debug: matchDebug(result),
      updated_at: matchNow,
    };
    await admin.from("games").update(gamesPatch).eq("id", gameId);

    if (bestHit?.igdb_game_id) {
      await admin.from("game_matches").insert({
        game_id: gameId,
        source,
        source_title: raw,
        source_external_id: opts?.external_id ?? null,
        igdb_game_id: Number(bestHit.igdb_game_id),
        status: "proposed",
        confidence,
        match_debug: matchDebug(result),
        updated_at: matchNow,
      });
    }

    const attemptResult = confidence >= NEEDS_REVIEW_THRESHOLD ? "low_confidence" : "miss";
    await admin.from("igdb_match_attempts").insert({
      platform_key: platformKey,
      external_id: opts?.external_id ?? null,
      release_id: opts?.release_id ?? null,
      raw_title: raw,
      cleaned_title: cleaned || raw,
      candidates: matchDebug(result),
      chosen_igdb_game_id: bestHit?.igdb_game_id ?? null,
      confidence,
      result: attemptResult,
      reason: confidence < AUTO_MATCH_THRESHOLD ? "below_threshold" : null,
    });

    if (confidence < AUTO_MATCH_THRESHOLD && opts?.source != null && opts?.external_id != null) {
      await admin.from("game_match_attempts").insert({
        source: opts.source,
        external_id: String(opts.external_id),
        title_used: raw,
        game_id: gameId,
        igdb_game_id_candidate: bestHit?.igdb_game_id ?? null,
        confidence,
        reasons_json: matchDebug(result) ? { scored: matchDebug(result) } : null,
        outcome: confidence >= NEEDS_REVIEW_THRESHOLD ? "pending" : "rejected",
      });
    }

    if (confidence < AUTO_MATCH_THRESHOLD) {
      const candidatesJson = scored.length
        ? scored.map((s) => ({ igdb_game_id: s.hit.igdb_game_id, title: s.hit.title, score: s.score }))
        : null;
      await admin.from("game_match_audit").insert({
        platform_key: opts?.platform_key ?? null,
        release_id: opts?.release_id ?? null,
        game_id: gameId,
        raw_title: raw,
        cleaned_title: cleaned || raw,
        igdb_game_id_candidate: bestHit?.igdb_game_id ?? null,
        igdb_title_candidate: bestHit?.title ?? null,
        confidence,
        decision: "pending",
        candidates: candidatesJson,
      });
      await admin.from("igdb_match_review_queue").insert({
        platform_key: opts?.platform_key ?? "catalog",
        external_id: opts?.external_id ?? null,
        release_id: opts?.release_id ?? null,
        raw_title: raw,
        cleaned_title: cleaned || raw,
        suggested_igdb_game_id: bestHit?.igdb_game_id ?? null,
        confidence,
        reason: "below_threshold",
        status: "pending",
      });
    }
    return { game_id: gameId, igdb_game_id: null };
  }

  /**
   * Get or create a games row by title only — NO IGDB search.
   * Use for thin import (Steam sync) so we never block on IGDB for 2000+ games.
   * Idempotent: lookup by canonical_title; insert only when missing (23505 → lookup and return).
   */
  export async function ensureGameTitleOnly(
    admin: { from: (t: string) => any },
    titleName: string
  ): Promise<{ game_id: string }> {
    const raw = String(titleName || "").trim();
    if (!raw) throw new Error("titleName empty");

    const canonicalNorm = normalizeCanonicalTitle(raw);

    const { data: existing, error: findErr } = await admin
      .from("games")
      .select("id")
      .eq("canonical_title", canonicalNorm)
      .maybeSingle();

    if (findErr) throw new Error(`game lookup canonical_title: ${findErr.message}`);
    if (existing?.id) return { game_id: String(existing.id) };

    const { data: inserted, error: insErr } = await admin
      .from("games")
      .insert({ canonical_title: canonicalNorm })
      .select("id")
      .single();

    if (insErr) {
      if ((insErr as any)?.code === "23505") {
        const { data: raced, error: t2Err } = await admin
          .from("games")
          .select("id")
          .eq("canonical_title", canonicalNorm)
          .maybeSingle();
        if (!t2Err && raced?.id) return { game_id: String(raced.id) };
      }
      throw new Error(`game insert: ${insErr.message}`);
    }
    return { game_id: String(inserted.id) };
  }
