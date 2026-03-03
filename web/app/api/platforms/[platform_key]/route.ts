import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

/** Resolve slug to canonical platform_key. Returns canonical or null. */
async function resolvePlatformSlug(slug: string): Promise<string | null> {
  const { data } = await supabaseServer.rpc("resolve_platform_slug", { p_slug: slug });
  return data ?? null;
}

/** Resolve platform display name: platform_catalog first, then hardware, else title-case */
async function getPlatformDisplayName(platformKey: string): Promise<string> {
  const key = platformKey.toLowerCase().trim();

  const { data: catalog } = await supabaseServer
    .from("platform_catalog")
    .select("display_name")
    .eq("platform_key", key)
    .maybeSingle();
  if (catalog?.display_name) return catalog.display_name;

  const { data: hw } = await supabaseServer
    .from("hardware")
    .select("display_name")
    .eq("slug", key)
    .maybeSingle();
  if (hw?.display_name) return hw.display_name;

  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ platform_key: string }> }
) {
  try {
    const { platform_key: raw } = await ctx.params;
    const slug = decodeURIComponent(raw ?? "").trim();
    if (!slug) {
      return NextResponse.json({ ok: false, error: "Missing platform_key" }, { status: 400 });
    }

    // Canonicalize
    const platformKey = ((await resolvePlatformSlug(slug)) ?? slug).toLowerCase();

    const url = new URL(req.url);
    const letterRaw = (url.searchParams.get("letter") ?? "all").toLowerCase();
    const letter = letterRaw === "all" ? "all" : letterRaw.toUpperCase();
    const yearParam = url.searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : null;

    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? String(PAGE_SIZE), 10) || PAGE_SIZE, 48);

    const cursorStr = url.searchParams.get("cursor") ?? "";
    const page = Math.max(0, parseInt(cursorStr, 10) || 0);
    const offset = page * limit;

    // Meta via platform_library_stats
    const { data: statsRows } = await supabaseServer.rpc("platform_library_stats", { p_platform_key: platformKey });
    const stats = Array.isArray(statsRows) ? statsRows[0] : statsRows;
    const displayName = await getPlatformDisplayName(platformKey);

    let q = supabaseServer
      .from("platform_library_entries")
      .select("release_id, title, release_year, cover_url")
      .eq("platform_key", platformKey)
      .order("sort_title", { ascending: true })
      .order("release_id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (letter !== "all") q = q.eq("sort_letter", letter.toUpperCase());
    if (year != null && !Number.isNaN(year)) q = q.eq("release_year", year);

    const { data: rows, error } = await q;

    if (error) {
      console.error("[platforms] query error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const items = rows ?? [];
    const nextCursor = items.length === limit ? String(page + 1) : null;

    return NextResponse.json({
      ok: true,
      platform_key: platformKey,
      meta: {
        display_name: displayName,
        total: stats?.total ?? 0,
        year_min: stats?.min_year ?? null,
        year_max: stats?.max_year ?? null,
      },
      items: items.map((r: any) => ({
        id: r.release_id,
        display_title: r.title,
        platform_key: platformKey,
        cover_url: r.cover_url ?? null,
        first_release_year: r.release_year ?? null,
      })),
      nextCursor,
    });
  } catch (e: any) {
    console.error("[platforms] error:", e);
    return NextResponse.json({ ok: false, error: e?.message ?? "Failed" }, { status: 500 });
  }
}
