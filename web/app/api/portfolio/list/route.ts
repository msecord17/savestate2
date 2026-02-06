import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET() {
  const supabase = await supabaseRoute();

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ error: userError.message }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { data, error } = await supabase
  .from("portfolio_entries")
  .select(`
    release_id,
    status,
    rating,
    playtime_minutes,
    last_played_at,
    updated_at,
    releases (
      id,
      display_title,
      platform_name,
      platform_key,
      cover_url,
      games (
        first_release_year,
        developer,
        genres,
        cover_url
      )
    )
  `)
  
  .eq("user_id", user.id)
  .order("updated_at", { ascending: false });


  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
