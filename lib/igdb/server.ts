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
  
  export async function igdbSearchBest(title: string): Promise<IgdbHit | null> {
    if (!IGDB_CLIENT_ID || !IGDB_ACCESS_TOKEN) return null;
  
    // Keep it simple: find top few title matches.
    // (We can get fancier with platform matching later.)
    const body = `
  search "${title.replaceAll('"', "")}";
  fields
    id,
    name,
    summary,
    first_release_date,
    genres.name,
    involved_companies.company.name,
    involved_companies.developer,
    involved_companies.publisher,
    cover.url;
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
  
    if (!res.ok || !Array.isArray(json) || json.length === 0) return null;
  
    // Heuristic: first result is usually fine for Steam titles.
    const g = json[0];
  
    const involved = Array.isArray(g?.involved_companies) ? g.involved_companies : [];
    const devCompany =
      involved.find((x: any) => x?.developer)?.company?.name ||
      involved[0]?.company?.name ||
      null;
  
    const pubCompany =
      involved.find((x: any) => x?.publisher)?.company?.name ||
      null;
  
    const genres = Array.isArray(g?.genres) ? g.genres.map((x: any) => x?.name).filter(Boolean) : [];
  
    const year =
      typeof g?.first_release_date === "number"
        ? new Date(g.first_release_date * 1000).getUTCFullYear()
        : null;
  
    return {
      igdb_game_id: Number(g.id),
      title: String(g.name || title),
      summary: g.summary ? String(g.summary) : null,
      genres,
      developer: devCompany ? String(devCompany) : null,
      publisher: pubCompany ? String(pubCompany) : null,
      first_release_year: year,
      cover_url: normalizeCover(g?.cover?.url ?? null),
    };
  }

  /** Strip ™ ® © and unicode variants (U+2122, U+00AE, U+00A9, etc.) for identity/search. */
  function stripTrademarkUnicode(s: string) {
    return String(s || "")
      .replace(/™|®|©|\u2122|\u00AE|\u00A9|\u24B8|\u24C7/g, "") // ™®© and unicode variants
      .replace(/\s+/g, " ")
      .trim();
  }

  function deMashTitle(s: string) {
    return (s || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Za-z])(\d)/g, "$1 $2")
      .replace(/(\d)([A-Za-z])/g, "$1 $2");
  }

  function normalizeSeparators(s: string) {
    return String(s || "")
      .replace(/[•·∙]/g, " ") // Disney•Pixar
      .replace(/[–—]/g, "-") // normalize dashes
      .replace(/&/g, " and ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stripPlatformSuffixes(s: string) {
    return String(s || "")
      .replace(/\b(ps4|ps5|ps3|ps2|ps1|psx|psp|vita)\b/gi, " ")
      .replace(/\b(xbox|series\s*x|series\s*s|xb1|x360)\b/gi, " ")
      .replace(/\b(playstation)\b/gi, " ")
      .replace(/\s+/g, " ")
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

  export function cleanTitleForIgdb(title: string) {
    const base = normalizeSeparators(deMashTitle(stripTrademarkUnicode(String(title || ""))));

    return stripPlatformSuffixes(expandCommonAbbrevs(normalizeRomanRanges(base)))
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

  /** Canonical normalization (dedupe identity): conservative only — strip ™®©, collapse whitespace. Do not use search-style rules (abbrevs, platforms, etc.) to avoid merging different games. */
  export function normalizeCanonicalTitle(s: string) {
    return stripTrademarkUnicode(String(s || "").trim());
  }

  /** Get or create games row: IGDB-first (by igdb_game_id), fallback upsert by canonical_title. */
  export async function upsertGameIgdbFirst(
    admin: { from: (t: string) => any },
    titleName: string,
    options?: { platform?: string }
  ): Promise<{ game_id: string; igdb_game_id: number | null }> {
    const raw = String(titleName || "").trim();
    if (!raw) throw new Error("titleName empty");

    const cleaned = cleanTitleForIgdb(raw);
    const hit = cleaned ? await igdbSearchBest(cleaned) : null;

    if (!hit) {
      const hasTrademark = /™|®|©|\u2122|\u00AE|\u00A9|\u24B8|\u24C7/u.test(raw);
      const hasMashy = /([a-z][A-Z])|([A-Za-z]\d)|(\d[A-Za-z])/.test(raw);
      console.warn("[IGDB miss] before/after:", {
        raw_title: raw,
        cleaned_title: cleaned || "(empty)",
        platform: options?.platform ?? "(unknown)",
        has_trademark_chars: hasTrademark,
        has_mashy_patterns: hasMashy,
      });
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
        .select("id")
        .eq("igdb_game_id", Number(hit.igdb_game_id))
        .maybeSingle();
      if (findErr) throw new Error(`game lookup igdb_game_id: ${findErr.message}`);
      if (existingByIgdb?.id) {
        // Do not patch canonical_title (uniqueness can block due to existing dupes); only metadata + cover
        const { canonical_title: _t, ...updatePatch } = patch;
        const { error: updErr } = await admin.from("games").update(updatePatch).eq("id", existingByIgdb.id);
        if (updErr) throw new Error(`game update igdb_game_id: ${updErr.message}`);
        return { game_id: String(existingByIgdb.id), igdb_game_id: Number(hit.igdb_game_id) };
      }
      // Not found by igdb id: try find by canonical_title first, then update it
      const { data: existingByTitle, error: tErr } = await admin
        .from("games")
        .select("id, igdb_game_id")
        .eq("canonical_title", patch.canonical_title)
        .maybeSingle();

      if (tErr) throw new Error(`game lookup canonical_title: ${tErr.message}`);

      if (existingByTitle?.id) {
        if (existingByTitle.igdb_game_id && existingByTitle.igdb_game_id !== patch.igdb_game_id) {
          const { igdb_game_id: _ig, canonical_title: _t, ...safePatch } = patch;
          const { error: updErr } = await admin.from("games").update(safePatch).eq("id", existingByTitle.id);
          if (updErr) throw new Error(`game update canonical_title: ${updErr.message}`);
          return { game_id: String(existingByTitle.id), igdb_game_id: Number(existingByTitle.igdb_game_id) };
        }
        const { canonical_title: _t, ...updatePatch } = patch;
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
              .select("id, igdb_game_id")
              .eq("igdb_game_id", patch.igdb_game_id)
              .maybeSingle();
            if (!e2 && existingByIgdb?.id) {
              const { igdb_game_id: _ig, canonical_title: _t, ...metaPatch } = patch;
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
              .select("id, igdb_game_id")
              .eq("canonical_title", patch.canonical_title)
              .maybeSingle();
            if (!t2Err && existingByTitle?.id) {
              if (existingByTitle.igdb_game_id && existingByTitle.igdb_game_id !== patch.igdb_game_id) {
                const { igdb_game_id: _ig, canonical_title: _t, ...safePatch } = patch;
                const { error: updErr } = await admin.from("games").update(safePatch).eq("id", existingByTitle.id);
                if (updErr) throw new Error(`game update after conflict: ${updErr.message}`);
                return { game_id: String(existingByTitle.id), igdb_game_id: Number(existingByTitle.igdb_game_id) };
              }
              const { canonical_title: _t, ...updatePatch } = patch;
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
    const { data: existingByTitle, error: tErr } = await admin
      .from("games")
      .select("id")
      .eq("canonical_title", normalizedRaw)
      .maybeSingle();

    if (tErr) throw new Error(`game lookup canonical_title: ${tErr.message}`);

    if (existingByTitle?.id) {
      return { game_id: String(existingByTitle.id), igdb_game_id: null };
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
