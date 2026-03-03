import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type Body = {
  release_id: string;
  hardware_id: string;
};

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRouteClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const release_id = String(body.release_id ?? "").trim();
    const hardware_id = String(body.hardware_id ?? "").trim();

    if (!release_id || !hardware_id) {
      return NextResponse.json({ ok: false, error: "Missing release_id or hardware_id" }, { status: 400 });
    }

    const { data: toDelete } = await supabaseServer
      .from("user_release_played_on")
      .select("id, is_primary")
      .eq("user_id", auth.user.id)
      .eq("release_id", release_id)
      .eq("hardware_id", hardware_id);

    const wasPrimary = (toDelete ?? []).some((r: any) => r.is_primary);

    const { error: delErr } = await supabaseServer
      .from("user_release_played_on")
      .delete()
      .eq("user_id", auth.user.id)
      .eq("release_id", release_id)
      .eq("hardware_id", hardware_id);

    if (delErr) return NextResponse.json({ ok: false, error: delErr.message }, { status: 500 });
    if (!wasPrimary) return NextResponse.json({ ok: true });
    const { data: remaining } = await supabaseServer
        .from("user_release_played_on")
        .select("id")
        .eq("user_id", auth.user.id)
        .eq("release_id", release_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (remaining?.id) {
      await supabaseServer
        .from("user_release_played_on")
        .update({ is_primary: true })
        .eq("id", remaining.id);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
