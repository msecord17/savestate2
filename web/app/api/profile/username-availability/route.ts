import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET(req: Request) {
  const supabase = await supabaseRouteClient();

  // auth required (avoids easy username scraping)
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const username = (searchParams.get("username") ?? "").trim();

  if (!username) {
    return NextResponse.json({ error: "Missing username" }, { status: 400 });
  }

  // basic validation (keep in sync with DB rules)
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return NextResponse.json(
      { available: false, reason: "3–20 chars. Letters, numbers, underscore." },
      { status: 200 }
    );
  }

  // Case-insensitive exact match check via ILIKE (no wildcards)
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, username")
    .ilike("username", username)
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hit = data?.[0];
  if (!hit) {
    return NextResponse.json({ available: true }, { status: 200 });
  }

  // If it's your own username (different casing), allow
  if (hit.user_id === userRes.user.id) {
    return NextResponse.json({ available: true }, { status: 200 });
  }

  return NextResponse.json({ available: false, reason: "Taken." }, { status: 200 });
}
