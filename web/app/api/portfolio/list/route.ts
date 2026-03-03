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
      id,
      release_id,
      created_at,
      status,
      playtime_minutes,
      release:releases(
        id,
        display_title,
        platform_key,
        cover_url,
        release_date,
        game:games(
          id,
          canonical_title,
          cover_url,
          first_release_year
        )
      )
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });


  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
