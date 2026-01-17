import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  }

  const user = userRes.user;

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("user_id, xbox_access_token, xbox_refresh_token, xbox_connected_at, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr) {
    return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
  }

  const access = String(profile?.xbox_access_token ?? "");
  const refresh = String(profile?.xbox_refresh_token ?? "");

  return NextResponse.json({
    ok: true,
    user_id: user.id,
    profile_exists: !!profile,
    has_access_token: !!access,
    access_token_len: access ? access.length : 0,
    has_refresh_token: !!refresh,
    refresh_token_len: refresh ? refresh.length : 0,
    xbox_connected_at: profile?.xbox_connected_at ?? null,
    updated_at: profile?.updated_at ?? null,
  });
}
