import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const listId = id;

  if (!listId || listId === "undefined") {
    return NextResponse.json({ error: "Missing list id in URL" }, { status: 400 });
  }

  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  // 1) Load list (must be yours OR curated)
  const { data: list, error: lErr } = await supabase
    .from("lists")
    .select("id, title, name, description, is_curated, user_id, created_at")
    .eq("id", listId)
    .single();

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });
  if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

  const L = list as any;

  const isOwner = list.user_id === user.id;
  const canView = list.is_curated === true || isOwner;
  if (!canView) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // 2) Load items + release meta
  let items: any[] = [];

  if (L.is_smart) {
    const rules = (L.rules ?? {}) as any;
  
  
    const statuses: string[] = Array.isArray(rules.statuses) ? rules.statuses : [];
    const platformKeys: string[] = Array.isArray(rules.platform_keys) ? rules.platform_keys : [];
  
    // Pull from portfolio items and join release meta
    let q = supabase
      .from("portfolio_items")
      .select("release_id, releases(id, display_title, platform_name, platform_key, cover_url)")
      .eq("user_id", user.id);
  
    if (statuses.length > 0) q = q.in("status", statuses);
    if (platformKeys.length > 0) q = q.in("releases.platform_key", platformKeys);
  
    const { data: rows, error: sErr } = await q;
    if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 });
  
    items = (rows ?? []).map((r: any) => ({
      release_id: r.release_id,
      releases: r.releases,
    }));
  } else {
    const { data: rows, error: iErr } = await supabase
      .from("list_items")
      .select("release_id, releases(id, display_title, platform_name, cover_url)")
      .eq("list_id", listId)
      .order("created_at", { ascending: false });
  
    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });
    items = rows ?? [];


  }

  return NextResponse.json({
    list: {
        id: list.id,
        title: (list.title ?? list.name) || "Untitled list",
        description: list.description ?? null,
        is_curated: !!list.is_curated,
        is_smart: !!L.is_smart,
        rules: L.rules ?? {},        
        created_at: list.created_at,
      },
      items      
  });
}
