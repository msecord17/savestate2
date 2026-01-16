import { NextResponse } from "next/server";
import { supabaseRouteClient } from "../../../../lib/supabase/route-client";

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();

  if (!userRes?.user) {
    return NextResponse.json({ user: null, profile: null });
  }

  const user = userRes.user;

  const { data: profile } = await supabase
    .from("profiles")
    .select(`
      steam_id, steam_connected_at, steam_last_synced_at, steam_last_sync_count,
      ra_username, ra_connected_at, ra_last_synced_at, ra_last_sync_count,
      psn_connected_at, psn_last_synced_at, psn_last_sync_count,
      xbox_connected_at, xbox_last_synced_at, xbox_last_sync_count, xbox_xuid,
      gamer_score_v11, gamer_score_v11_confidence, gamer_score_v11_breakdown, gamer_score_v11_updated_at
    `)
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    profile: profile ?? null,
  });
}
