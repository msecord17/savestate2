import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET() {
  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  // 1) Get my lists (no relationship count here)
  const { data: lists, error: lErr } = await supabase
    .from("lists")
    .select("id, title, name, description, created_at, is_curated, is_smart, rules, user_id")
    .eq("is_curated", false)
    .order("created_at", { ascending: false });

  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 });

  const listIds = (lists ?? []).map((l: any) => l.id);

  // 2) Get list_items for those lists and compute counts in code
  let counts: Record<string, number> = {};
  if (listIds.length > 0) {
    const { data: items, error: iErr } = await supabase
      .from("list_items")
      .select("list_id")
      .in("list_id", listIds);

    if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

    for (const it of items ?? []) {
      const id = (it as any).list_id as string;
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }

  const rows = (lists ?? []).map((l: any) => ({
    id: l.id,
    title: (l.title ?? l.name) || "Untitled list",
    description: l.description ?? null,
    item_count: counts[l.id] ?? 0,
    created_at: l.created_at,
  }));

  return NextResponse.json(rows);
}
