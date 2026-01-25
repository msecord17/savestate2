import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function POST(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const steamid64 = String(body?.steamid64 ?? "").trim();

  if (!steamid64 || !/^\d{16,20}$/.test(steamid64)) {
    return NextResponse.json({ error: "Missing/invalid steamid64" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_steam_connections")
    .upsert({ user_id: userRes.user.id, steamid64 }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
