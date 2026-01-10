import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET() {
  const supabase = await supabaseRoute();

  const { data, error } = await supabase
    .from("lists")
    .select("id, title, description, is_curated, created_at")
    .eq("is_curated", true)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
