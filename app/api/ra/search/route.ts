import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { raSearchGamesByTitle } from "@/lib/ra/server";

export async function GET(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });

  const { data: conn, error: connErr } = await supabase
    .from("user_ra_connections")
    .select("ra_username, ra_api_key")
    .eq("user_id", userRes.user.id)
    .maybeSingle();

  if (connErr) return NextResponse.json({ error: connErr.message }, { status: 500 });
  if (!conn?.ra_username || !conn?.ra_api_key) {
    return NextResponse.json({ error: "RetroAchievements not connected yet." }, { status: 400 });
  }

  const results = await raSearchGamesByTitle(conn.ra_username, conn.ra_api_key, q);
  return NextResponse.json({ ok: true, q, results });
}
