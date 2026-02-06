import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";

export async function POST(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const user = userRes.user;
  const body = await req.json().catch(() => ({}));

  const ra_username = String(body?.ra_username ?? "").trim();
  const ra_api_key = String(body?.ra_api_key ?? "").trim();

  if (!ra_username) return NextResponse.json({ error: "Missing ra_username" }, { status: 400 });
  if (!ra_api_key) return NextResponse.json({ error: "Missing ra_api_key" }, { status: 400 });

  const { error: upsertErr } = await supabase.from("profiles").upsert({
    user_id: user.id,
    ra_username,
    ra_api_key,
    updated_at: new Date().toISOString(),
  });

  if (upsertErr) {
    return NextResponse.json({ error: upsertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
