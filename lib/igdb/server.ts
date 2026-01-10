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
  