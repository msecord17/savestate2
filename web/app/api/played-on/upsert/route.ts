import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";
import { resolveHardwareBySlugOrAlias } from "@/lib/hardware/resolve";

type Body = {
  release_id: string;
  hardware_slug?: string | null;
  hardware_id?: string | null;
  note?: string | null;
};

export async function POST(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const release_id = String(body?.release_id ?? "").trim();
  let hardwareId = (body.hardware_id ?? null)?.toString().trim() || null;

  if (!hardwareId) {
    const slugOrAlias = (body.hardware_slug ?? null)?.toString().trim() || null;
    if (slugOrAlias) {
      const hw = await resolveHardwareBySlugOrAlias(supabaseServer as any, slugOrAlias);
      if (!hw) return NextResponse.json({ error: "Unknown hardware_slug" }, { status: 400 });
      hardwareId = hw.id;
    }
  }

  if (!release_id || !hardwareId) {
    return NextResponse.json({ ok: false, error: "Missing release_id or hardware_id or hardware_slug" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("user_release_played_on")
    .upsert(
      { user_id: auth.user.id, release_id, hardware_id: hardwareId, updated_at: new Date().toISOString() },
      { onConflict: "user_id,release_id" }
    )
    .select("release_id, hardware_id, hardware:hardware_id(id, slug, display_name)")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, item: data });
}
