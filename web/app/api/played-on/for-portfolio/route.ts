import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data: pe, error: peErr } = await supabaseServer
    .from("portfolio_entries")
    .select("release_id")
    .eq("user_id", auth.user.id);

  if (peErr) return NextResponse.json({ ok: false, error: peErr.message }, { status: 500 });

  const ids = (pe ?? []).map((x) => x.release_id).filter(Boolean);
  if (ids.length === 0) return NextResponse.json({ ok: true, map: {} });

  const { data, error } = await supabaseServer
    .from("user_release_played_on")
    .select("release_id, hardware_id, hardware:hardware_id(id, slug, display_name)")
    .eq("user_id", auth.user.id)
    .in("release_id", ids);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const map: Record<string, any> = {};
  for (const row of data ?? []) map[row.release_id] = row;

  return NextResponse.json({ ok: true, map });
}
