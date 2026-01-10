import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: Request) {
  const supabase = await supabaseRoute();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { release_id, status } = await req.json();

  if (!release_id || !status) {
    return NextResponse.json(
      { error: "Missing release_id or status" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("portfolio_entries")
    .upsert(
      { user_id: user.id, release_id, status, source: "manual" },
      { onConflict: "user_id,release_id" }
    )
    .select("id, user_id, release_id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entry: data });
}
