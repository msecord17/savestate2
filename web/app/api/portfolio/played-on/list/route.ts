import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("user_release_played_on")
    .select("release_id, hardware_id, source, is_primary, hardware:hardware_id(id, slug, display_name, kind, manufacturer, model, era_key, is_modern_retro_handheld)")
    .eq("user_id", user.id)
    .eq("is_primary", true);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}
