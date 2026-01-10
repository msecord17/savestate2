import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../../lib/supabase/route-client";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();

    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const user = userRes.user;
    const body = await req.json().catch(() => ({}));
    const ra_username = String(body?.ra_username ?? "").trim();

    if (!ra_username) {
      return NextResponse.json({ error: "Missing ra_username" }, { status: 400 });
    }

    const { error: upErr } = await supabase.from("profiles").upsert({
      user_id: user.id,
      ra_username,
      ra_connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, ra_username });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to connect RA" }, { status: 500 });
  }
}
