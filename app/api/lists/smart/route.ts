import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: Request) {
  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = (body?.title ?? "").trim();
  const statuses = Array.isArray(body?.statuses) ? body.statuses : [];
  const platform_keys = Array.isArray(body?.platform_keys) ? body.platform_keys : [];

  if (!title) return NextResponse.json({ error: "Missing title" }, { status: 400 });

  const rules = {
    statuses,
    platform_keys,
  };

  const { data, error } = await supabase
    .from("lists")
    .insert({
      user_id: user.id,
      title,
      is_curated: false,
      is_smart: true,
      rules,
    })
    .select("id, title, is_smart, rules")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
