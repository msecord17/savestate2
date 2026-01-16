import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function POST() {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { error } = await supabase
    .from("profiles")
    .update({
      xbox_connected_at: null,
      xbox_access_token: null,
      xbox_refresh_token: null,
      xbox_last_synced_at: null,
      xbox_last_sync_count: null,
      xbox_gamerscore: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userRes.user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
