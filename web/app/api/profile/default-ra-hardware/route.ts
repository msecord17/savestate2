import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("default_ra_hardware_id, hardware:default_ra_hardware_id (id, slug, display_name)")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    default: data?.hardware ?? null,
  });
}

export async function POST(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const hardwareSlug = body?.hardwareSlug as string | undefined;

  if (!hardwareSlug) {
    return NextResponse.json({ ok: false, error: "missing_hardwareSlug" }, { status: 400 });
  }

  const { data: hw, error: hwErr } = await supabase
    .from("hardware")
    .select("id, slug, display_name")
    .eq("slug", hardwareSlug)
    .single();

  if (hwErr) return NextResponse.json({ ok: false, error: hwErr.message }, { status: 400 });

  const { error } = await supabase
    .from("profiles")
    .update({ default_ra_hardware_id: hw.id })
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, hardware: hw });
}

export async function DELETE() {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ default_ra_hardware_id: null })
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
