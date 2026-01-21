import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const url = new URL(req.url);
  const release_id = String(url.searchParams.get("release_id") ?? "").trim();
  if (!release_id) return NextResponse.json({ error: "Missing release_id" }, { status: 400 });

  const { data, error } = await supabase
    .from("psn_trophies")
    .select("trophy_group_id,trophy_id,trophy_name,trophy_detail,trophy_type,trophy_icon_url,earned,earned_at")
    .eq("release_id", release_id)
    .order("trophy_group_id", { ascending: true })
    .order("trophy_id", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, trophies: data ?? [] });
}
