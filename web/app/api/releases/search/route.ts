import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = (url.searchParams.get("query") ?? "").trim();

  // Always return an array
  if (!query) {
    return NextResponse.json([]);
  }

  // Simple "contains" match against Release display titles
  const { data, error } = await supabaseServer
    .from("releases")
    .select("id, display_title, platform_name")
    .ilike("display_title", `%${query}%`)
    .order("display_title")
    .limit(25);

  if (error) {
    console.error("Supabase error in /api/releases/search:", error);
    return NextResponse.json([], { status: 200 });
  }

  return NextResponse.json(data ?? []);
}
