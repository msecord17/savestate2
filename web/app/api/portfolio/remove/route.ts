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

  const { release_id } = await req.json();

  if (!release_id) {
    return NextResponse.json({ error: "Missing release_id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("portfolio_entries")
    .delete()
    .eq("user_id", user.id)
    .eq("release_id", release_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
