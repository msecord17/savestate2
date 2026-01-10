import { NextResponse } from "next/server";

function igdbImage(url: string, size: string = "cover_big") {
  // IGDB returns URLs like //images.igdb.com/igdb/image/upload/t_thumb/xxxxx.jpg
  // swap the size token
  if (!url) return null;
  const fixed = url.startsWith("//") ? `https:${url}` : url;
  return fixed.replace("/t_thumb/", `/t_${size}/`);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json({ results: [] });

  const clientId = process.env.IGDB_CLIENT_ID;
  const token = process.env.IGDB_ACCESS_TOKEN;
  if (!clientId || !token) {
    return NextResponse.json({ error: "Missing IGDB env vars" }, { status: 500 });
  }

  // IGDB API uses POST with a query body
  const body = `
    fields id,name,summary,genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,cover.url,first_release_date,platforms.abbreviation,platforms.name;
    search "${q.replace(/"/g, '\\"')}";
    limit 12;
  `;

  const r = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body,
  });

  const text = await r.text();
  const data = text ? JSON.parse(text) : null;

  if (!r.ok) {
    return NextResponse.json(
      { error: data?.message ?? `IGDB failed (${r.status})`, raw: data },
      { status: 500 }
    );
  }

  const results = (Array.isArray(data) ? data : []).map((g: any) => {
    const companies = Array.isArray(g.involved_companies) ? g.involved_companies : [];
    const dev = companies.find((c: any) => c?.developer)?.company?.name ?? null;
    const pub = companies.find((c: any) => c?.publisher)?.company?.name ?? null;

    return {
      provider: "igdb",
      igdb_game_id: g.id,
      title: g.name,
      summary: g.summary ?? null,
      genres: (g.genres ?? []).map((x: any) => x?.name).filter(Boolean),
      developer: dev,
      publisher: pub,
      cover_url: igdbImage(g.cover?.url, "cover_big"),
      // we'll use platform selection when creating a release
      platforms: (g.platforms ?? []).map((p: any) => ({
        name: p?.name,
        abbr: p?.abbreviation,
      })),
    };
  });

  return NextResponse.json({ results });
}

