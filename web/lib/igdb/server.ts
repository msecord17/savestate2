type IgdbHit = {
    igdb_game_id: number;
    title: string;
    summary: string | null;
    genres: string[];
    developer: string | null;
    publisher: string | null;
    first_release_year: number | null;
    cover_url: string | null;
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

  /** Tokenize for overlap: lowercase, split on non-alphanumeric, unique. */
  function tokenize(s: string): string[] {
    return Array.from(
      new Set(
        String(s || "")
          .toLowerCase()
          .replace(/™|®|©/g, "")
          .split(/[^a-z0-9]+/)
          .filter(Boolean)
      )
    );
  }

  /**
   * Score a candidate hit against the query title.
   * Base = token overlap; strong bonus if candidate name or first_release_year matches intended year.
   */
  function scoreCandidate(
    hit: IgdbHit,
    queryTokens: string[],
    expectedYear: string | null,
    yearToken: string | null
  ): number {
    const nameTokens = tokenize(hit.title);
    let score = 0;
    for (const t of queryTokens) {
      if (t.length < 2) continue;
      if (nameTokens.includes(t)) score += 10;
    }
    if (expectedYear && yearToken) {
      if (nameTokens.includes(yearToken)) score += 100;
      if (hit.first_release_year !== null && hit.first_release_year === parseInt(expectedYear, 10)) score += 100;
    }
    return score;
  }

  export async function igdbSearchBest(
    title: string,
    options?: { rawTitle?: string }
  ): Promise<IgdbHit | null> {
    if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) return null;

    const rawTitle = options?.rawTitle ?? title;
    const tried = buildIgdbQueryCandidates(rawTitle);

    for (const q of tried) {
      const body = `
search "${q.replaceAll('"', "")}";
fields ${IGDB_FIELDS};
limit 5;
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
        return buildHitFromGame(json[0], title);
      }
    }

    const slug = slugifyForIgdb(cleanTitleForIgdb(rawTitle));
    if (slug) {
      const slugResult = await igdbWhereSlug(slug);
      if (Array.isArray(slugResult) && slugResult.length > 0) {
        return buildHitFromGame(slugResult[0], title);
      }
    }

    console.log("[IGDB MISS]", { rawTitle, tried });
    return null;
  }

  /** Strip ™ ® © and unicode variants (U+2122, U+00AE, U+00A9, etc.) for identity/search. */
  function stripTrademarkUnicode(s: string) {
    return String(s || "")
      .replace(/™|®|©|\u2122|\u00AE|\u00A9|\u24B8|\u24C7/g, "") // ™®© and unicode variants
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Never split 2K9/2K10-style tokens: protect with placeholder, run spacing, then re-collapse. */
  function deMashTitle(s: string) {
    const P = "\uE000";
    const Q = "\uE001";
    return (s || "")
      .replace(/\b2K(\d{1,2})\b/gi, P + "$1" + Q)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2") // PGATour -> PGA Tour
      .replace(/([A-Za-z])(\d)/g, "$1 $2")
      .replace(/(\d)([A-Za-z])/g, "$1 $2")
      .replace(/\uE000(\d{1,2})\uE001/gi, "2K$1")
      .replace(/\b2 K (\d{1,2})\b/gi, "2K$1");
  }

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
  function shouldOverwriteCover(
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
   * Xbox-specific non-game ignore list. Prevents infinite IGDB misses for known apps (iHeartRadio, Movies & TV, etc.).
   * When platform is xbox and title matches, skip IGDB and mark ignored (log for now).
   */
  const XBOX_NON_GAME_PATTERN = /\b(iheartradio|movies\s*&\s*tv|amazon\s+instant\s+video|netflix|hulu|spotify|groove\s+music|movies\s+&\s+tv|instant\s+video)\b|amazon\s+instant|movies\s*&\s*tv/i;

  function isXboxNonGame(title: string): boolean {
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
   * Get or create games row: IGDB-first (by igdb_game_id), fallback upsert by canonical_title.
   * Spine rule: only attempt IGDB search when igdb_game_id IS NULL. If we already have a game
   * with that canonical_title and igdb_game_id set, return it without re-searching.
   * When opts.platform_key is set (e.g. "xbox"), resolves alias from title_aliases and uses it as IGDB search input.
   */
  export async function upsertGameIgdbFirst(
    admin: { from: (t: string) => any },
    titleName: string,
    opts?: { platform?: string; platform_key?: string }
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

    // Alias resolution before IGDB: if platform_key set (e.g. xbox), use title_aliases.search_title for lookup; else fall back to raw
    const alias = opts?.platform_key ? await resolveAlias(admin, opts.platform_key, raw) : null;
    const cleaned = cleanTitleForIgdb(alias ?? raw);
    const expanded = expandCommonAbbrevsForSearch(cleaned);

    // Skip IGDB entirely for known non-games (apps); canonical_title stays from IGDB hit when we get one
    const xboxIgnored = opts?.platform_key === "xbox" && isXboxNonGame(raw);
    if (xboxIgnored) {
      console.warn("[XBOX_IGNORED] Skipping IGDB for known app/non-game:", raw);
    }

    // Only search IGDB when igdb_game_id IS NULL and title looks like a game (not app/demo/utility)
    const hit = xboxIgnored || isLikelyNonGame(raw)
      ? null
      : expanded
        ? await igdbSearchBest(expanded, { rawTitle: raw })
        : cleaned
          ? await igdbSearchBest(cleaned, { rawTitle: raw })
          : null;

    if (!hit) {
      const hasTrademark = /™|®|©|\u2122|\u00AE|\u00A9|\u24B8|\u24C7/u.test(raw);
      const hasMashy = /([a-z][A-Z])|([A-Za-z]\d)|(\d[A-Za-z])/.test(raw);
      if (!xboxIgnored) {
        console.warn("[IGDB miss] before/after:", {
        raw_title: raw,
        cleaned_title: cleaned || "(empty)",
        platform: opts?.platform ?? opts?.platform_key ?? "(unknown)",
        has_trademark_chars: hasTrademark,
        has_mashy_patterns: hasMashy,
      });
      }
    }

    if (hit?.igdb_game_id) {
      const canonical = normalizeCanonicalTitle(String(hit.title || raw).trim() || raw);
      const patch: any = {
        igdb_game_id: Number(hit.igdb_game_id),
        canonical_title: canonical,
        updated_at: new Date().toISOString(),
      };
      if (hit.summary != null) patch.summary = hit.summary;
      if (hit.developer != null) patch.developer = hit.developer;
      if (hit.publisher != null) patch.publisher = hit.publisher;
      if (hit.first_release_year != null) patch.first_release_year = hit.first_release_year;
      if (Array.isArray(hit.genres) && hit.genres.length) patch.genres = hit.genres;
      if (hit.cover_url) patch.cover_url = hit.cover_url;

      const { data: existingByIgdb, error: findErr } = await admin
        .from("games")
        .select("id, cover_url")
        .eq("igdb_game_id", Number(hit.igdb_game_id))
        .maybeSingle();
      if (findErr) throw new Error(`game lookup igdb_game_id: ${findErr.message}`);
      if (existingByIgdb?.id) {
        const { canonical_title: _t, ...updatePatch } = patch;
        if (existingByIgdb.cover_url && !shouldOverwriteCover(existingByIgdb.cover_url)) delete updatePatch.cover_url;
        const { error: updErr } = await admin.from("games").update(updatePatch).eq("id", existingByIgdb.id);
        if (updErr) throw new Error(`game update igdb_game_id: ${updErr.message}`);
        return { game_id: String(existingByIgdb.id), igdb_game_id: Number(hit.igdb_game_id) };
      }
      // Not found by igdb id: try find by canonical_title first, then update it
      const { data: existingByTitle, error: tErr } = await admin
        .from("games")
        .select("id, igdb_game_id, cover_url")
        .eq("canonical_title", patch.canonical_title)
        .maybeSingle();

      if (tErr) throw new Error(`game lookup canonical_title: ${tErr.message}`);

      if (existingByTitle?.id) {
        if (existingByTitle.igdb_game_id && existingByTitle.igdb_game_id !== patch.igdb_game_id) {
          const { igdb_game_id: _ig, canonical_title: _t, ...safePatch } = patch;
          if (existingByTitle.cover_url && !shouldOverwriteCover(existingByTitle.cover_url)) delete safePatch.cover_url;
          const { error: updErr } = await admin.from("games").update(safePatch).eq("id", existingByTitle.id);
          if (updErr) throw new Error(`game update canonical_title: ${updErr.message}`);
          return { game_id: String(existingByTitle.id), igdb_game_id: Number(existingByTitle.igdb_game_id) };
        }
        const { canonical_title: _t, ...updatePatch } = patch;
        if (existingByTitle.cover_url && !shouldOverwriteCover(existingByTitle.cover_url)) delete updatePatch.cover_url;
        const { error: updErr } = await admin.from("games").update(updatePatch).eq("id", existingByTitle.id);
        if (updErr) throw new Error(`game update canonical_title: ${updErr.message}`);
        return { game_id: String(existingByTitle.id), igdb_game_id: Number(patch.igdb_game_id) };
      }

      const { data: inserted, error: insErr } = await admin
        .from("games")
        .insert(patch)
        .select("id")
        .single();
      if (insErr) {
        // 23505: which unique constraint collided? games_igdb_* → lookup by igdb; games_canonical_title_* → lookup by title + update metadata
        if ((insErr as any)?.code === "23505") {
          const msg = String((insErr as any)?.message ?? "").toLowerCase();

          // games_igdb_unique / games_igdb_game_id_unique_not_null: another row has this igdb_game_id → return that row
          const isIgdbConstraint = msg.includes("games_igdb") || msg.includes("igdb_game_id");
          if (isIgdbConstraint) {
            const { data: existingByIgdb, error: e2 } = await admin
              .from("games")
              .select("id, igdb_game_id, cover_url")
              .eq("igdb_game_id", patch.igdb_game_id)
              .maybeSingle();
            if (!e2 && existingByIgdb?.id) {
              const { igdb_game_id: _ig, canonical_title: _t, ...metaPatch } = patch;
              if (existingByIgdb.cover_url && !shouldOverwriteCover(existingByIgdb.cover_url)) delete metaPatch.cover_url;
              const { error: updErr } = await admin.from("games").update(metaPatch).eq("id", existingByIgdb.id);
              if (updErr) throw new Error(`game update after igdb conflict: ${updErr.message}`);
              return { game_id: String(existingByIgdb.id), igdb_game_id: Number(existingByIgdb.igdb_game_id) };
            }
          }

          // games_canonical_title_unique: another row has this canonical_title → lookup by title, update metadata, return
          const isCanonicalConstraint = msg.includes("canonical_title");
          if (isCanonicalConstraint || !isIgdbConstraint) {
            const { data: existingByTitle, error: t2Err } = await admin
              .from("games")
              .select("id, igdb_game_id, cover_url")
              .eq("canonical_title", patch.canonical_title)
              .maybeSingle();
            if (!t2Err && existingByTitle?.id) {
              if (existingByTitle.igdb_game_id && existingByTitle.igdb_game_id !== patch.igdb_game_id) {
                const { igdb_game_id: _ig, canonical_title: _t, ...safePatch } = patch;
                if (existingByTitle.cover_url && !shouldOverwriteCover(existingByTitle.cover_url)) delete safePatch.cover_url;
                const { error: updErr } = await admin.from("games").update(safePatch).eq("id", existingByTitle.id);
                if (updErr) throw new Error(`game update after conflict: ${updErr.message}`);
                return { game_id: String(existingByTitle.id), igdb_game_id: Number(existingByTitle.igdb_game_id) };
              }
              const { canonical_title: _t, ...updatePatch } = patch;
              if (existingByTitle.cover_url && !shouldOverwriteCover(existingByTitle.cover_url)) delete updatePatch.cover_url;
              const { error: updErr } = await admin.from("games").update(updatePatch).eq("id", existingByTitle.id);
              if (updErr) throw new Error(`game update after conflict: ${updErr.message}`);
              return { game_id: String(existingByTitle.id), igdb_game_id: Number(patch.igdb_game_id) };
            }
          }
        }
        throw new Error(`game insert: ${insErr.message}`);
      }
      return { game_id: String(inserted.id), igdb_game_id: Number(patch.igdb_game_id) };
    }

    // No IGDB hit: title lookup then update or insert (use normalized title for identity)
    const normalizedRaw = normalizeCanonicalTitle(raw);
    const { data: existingTitleRow, error: tErr } = await admin
      .from("games")
      .select("id")
      .eq("canonical_title", normalizedRaw)
      .maybeSingle();

    if (tErr) throw new Error(`game lookup canonical_title: ${tErr.message}`);

    if (existingTitleRow?.id) {
      return { game_id: String(existingTitleRow.id), igdb_game_id: null };
    }

    const { data: inserted, error: insErr } = await admin
      .from("games")
      .insert({ canonical_title: normalizedRaw })
      .select("id")
      .single();
    if (insErr) {
      // 23505: games_canonical_title_unique — lookup by canonical_title and return existing row
      if ((insErr as any)?.code === "23505") {
        const { data: existingByTitle, error: t2Err } = await admin
          .from("games")
          .select("id")
          .eq("canonical_title", normalizedRaw)
          .maybeSingle();
        if (!t2Err && existingByTitle?.id) return { game_id: String(existingByTitle.id), igdb_game_id: null };
      }
      throw new Error(`game insert: ${insErr.message}`);
    }
    return { game_id: String(inserted.id), igdb_game_id: null };
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
