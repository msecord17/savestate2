import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRouteClient();
    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const ra_username = String(body?.ra_username ?? "").trim();
    const ra_api_key = String(body?.ra_api_key ?? "").trim();

    if (!ra_username || !ra_api_key) {
      return NextResponse.json({ error: "Missing ra_username or ra_api_key" }, { status: 400 });
    }

    const payload = { user_id: userRes.user.id, ra_username, ra_api_key };

    console.log("[RA CONNECT] upserting", { user_id: payload.user_id, ra_username: payload.ra_username, key_len: payload.ra_api_key.length });

    const { data, error } = await supabase
      .from("user_ra_connections")
      .upsert(payload, { onConflict: "user_id" })
      .select()
      .maybeSingle();

    if (error) {
      console.error("[RA CONNECT] upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log("[RA CONNECT] saved row:", { user_id: data?.user_id, ra_username: data?.ra_username });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to connect RA" }, { status: 500 });
  }
}
