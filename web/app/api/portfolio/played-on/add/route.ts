import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type Body = {
  release_id: string;
  hardware_id: string;
  source?: string;
};

const SOURCE_VALUES = ["manual", "ra_default", "ra_manual_override", "system_detected"] as const;
type Source = (typeof SOURCE_VALUES)[number];

const ALLOWED_SOURCES = new Set<Source>(SOURCE_VALUES);

function isSource(x: unknown): x is Source {
  return typeof x === "string" && ALLOWED_SOURCES.has(x as Source);
}

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

    const source: Source = isSource(body.source) ? body.source : "manual";

    // Verify hardware exists
    const { data: hw } = await supabaseServer
      .from("hardware")
      .select("id")
      .eq("id", hardware_id)
      .maybeSingle();

    if (!hw) {
      return NextResponse.json({ ok: false, error: "Unknown hardware_id" }, { status: 400 });
    }

    // Check if row already exists (any source for this hardware)
    const { data: existingRows } = await supabaseServer
      .from("user_release_played_on")
      .select("id")
      .eq("user_id", auth.user.id)
      .eq("release_id", release_id)
      .eq("hardware_id", hardware_id)
      .limit(1);

    if ((existingRows ?? []).length > 0) {
      return NextResponse.json({ ok: true });
    }

    // Check if this is the first entry for this release
    const { count } = await supabaseServer
      .from("user_release_played_on")
      .select("id", { count: "exact", head: true })
      .eq("user_id", auth.user.id)
      .eq("release_id", release_id);

    const isFirst = (count ?? 0) === 0;

    // Unset existing primary if adding another
    if (!isFirst) {
      await supabaseServer
        .from("user_release_played_on")
        .update({ is_primary: false })
        .eq("user_id", auth.user.id)
        .eq("release_id", release_id);
    }

    const { error } = await supabaseServer
      .from("user_release_played_on")
      .insert({
        user_id: auth.user.id,
        release_id,
        hardware_id,
        source,
        is_primary: isFirst,
      });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
