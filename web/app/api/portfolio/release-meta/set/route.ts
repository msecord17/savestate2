import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

type Body = {
  release_id: string;

  // partial updates allowed
  identity_tier?: string | null;
  replays?: number | null;

  owned_digital?: boolean | null;
  owned_physical?: boolean | null;
  owned_rented?: boolean | null;
};

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const release_id = String(body.release_id ?? "").trim();

    if (!release_id) {
      return NextResponse.json({ error: "Missing release_id" }, { status: 400 });
    }

    // Build patch from provided fields only
    const patch: Record<string, any> = {
      user_id: user.id,
      release_id,
    };

    if ("identity_tier" in body) {
      const t = body.identity_tier == null ? null : String(body.identity_tier).trim();
      patch.identity_tier = t ? t : null;
    }

    if ("replays" in body) {
      const r = body.replays == null ? null : Number(body.replays);
      if (r != null && (!Number.isFinite(r) || r < 0)) {
        return NextResponse.json({ error: "replays must be >= 0" }, { status: 400 });
      }
      patch.replays = r;
    }

    if ("owned_digital" in body) patch.owned_digital = body.owned_digital;
    if ("owned_physical" in body) patch.owned_physical = body.owned_physical;
    if ("owned_rented" in body) patch.owned_rented = body.owned_rented;

    const { data, error } = await supabase
      .from("user_release_meta")
      .upsert(patch, { onConflict: "user_id,release_id" })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, meta: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
