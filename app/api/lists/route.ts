import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET() {
  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { data, error } = await supabase
    .from("lists")
    .select("id, title, name, description, created_at, is_curated, is_smart, rules")
    .eq("user_id", user.id)
    .eq("is_curated", false)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = (body?.title ?? "").trim();
  const description = (body?.description ?? "").trim();

  if (!title) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("lists")
    .insert({
        user_id: user.id,
      
        // ✅ legacy required column
        name: title,
      
        // ✅ new column we want to standardize on
        title,
      
        description: description || null,
        is_curated: false,
      })
      
      .select("id, title, name, description, is_curated, created_at, list_items(count)")


  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows =
  (data ?? []).map((l: any) => ({
    id: l.id,
    title: (l.title ?? l.name) || "Untitled list",
    description: l.description ?? null,
    is_curated: !!l.is_curated,
    created_at: l.created_at,
    item_count: l.list_items?.[0]?.count ?? 0,
  })) ?? [];

return NextResponse.json(rows);

}
