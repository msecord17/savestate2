import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { user_id, release_id } = body;

  const { error } = await supabaseServer
    .from("portfolio_entries")
    .insert({
      user_id,
      release_id,
      status: "wishlist",
      source: "manual",
    });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
