import { NextRequest, NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET(req: NextRequest) {
  const supabase = await supabaseRouteClient();
  const releaseId = req.nextUrl.searchParams.get("releaseId");

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!releaseId) return NextResponse.json({ ok: false, error: "missing_releaseId" }, { status: 400 });

  const { data, error } = await supabase
    .from("user_release_played_on")
    .select("hardware_id, source, is_primary, hardware:hardware_id (id, slug, display_name)")
    .eq("user_id", auth.user.id)
    .eq("release_id", releaseId)
    .order("is_primary", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  const primaryRow = (data ?? []).find((r: any) => r.is_primary) ?? null;

  return NextResponse.json({
    ok: true,
    primary: primaryRow?.hardware ?? null,
    primary_source: primaryRow?.source ?? null,
    rows: data ?? [],
  });
}
