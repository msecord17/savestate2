import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (!q) return NextResponse.json([]);

  const { data, error } = await supabaseServer
    .from("releases")
    .select(
      `
      id,
      display_title,
      platform_key,
      cover_url,
      release_date,
      game_id,
      games:games (
        display_title,
        cover_url,
        first_release_year
      )
    `
    )
    .ilike("display_title", `%${q}%`)
    .order("display_title")
    .limit(25);

  if (error) {
    console.error("catalog search error", error);
    return NextResponse.json([]);
  }

  const results = (data ?? []).map((r: any) => ({
    id: r.id,
    release_id: r.id,
    display_title: r.display_title ?? r.games?.display_title ?? "Untitled",
    title: r.display_title ?? r.games?.display_title,
    platform_key: r.platform_key ?? null,
    cover_url: r.cover_url ?? r.games?.cover_url ?? null,
    year: r.games?.first_release_year ?? (r.release_date ? new Date(r.release_date).getFullYear() : null),
    first_release_year: r.games?.first_release_year ?? null,
  }));

  return NextResponse.json(results);
}

export async function POST(req: Request) {
  let q = "";
  try {
    const body = await req.json();
    q = String(body?.q ?? "").trim();
  } catch {
    return NextResponse.json([]);
  }
  if (!q) return NextResponse.json([]);

  const { data, error } = await supabaseServer
    .from("releases")
    .select(
      `
      id,
      display_title,
      platform_key,
      cover_url,
      release_date,
      games:games (
        display_title,
        cover_url,
        first_release_year
      )
    `
    )
    .ilike("display_title", `%${q}%`)
    .order("display_title")
    .limit(25);

  if (error) {
    console.error("catalog search POST error", error);
    return NextResponse.json([]);
  }

  const results = (data ?? []).map((r: any) => ({
    id: r.id,
    release_id: r.id,
    display_title: r.display_title ?? r.games?.display_title ?? "Untitled",
    title: r.display_title ?? r.games?.display_title,
    platform_key: r.platform_key ?? null,
    cover_url: r.cover_url ?? r.games?.cover_url ?? null,
    year: r.games?.first_release_year ?? (r.release_date ? new Date(r.release_date).getFullYear() : null),
    first_release_year: r.games?.first_release_year ?? null,
  }));

  return NextResponse.json(results);
}
