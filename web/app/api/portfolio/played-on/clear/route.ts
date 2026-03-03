import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type Body = {
  release_id: string;
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

    if (!release_id) {
      return NextResponse.json({ ok: false, error: "Missing release_id" }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from("user_release_played_on")
      .delete()
      .eq("user_id", auth.user.id)
      .eq("release_id", release_id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
