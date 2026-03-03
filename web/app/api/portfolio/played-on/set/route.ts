// app/api/portfolio/played-on/set/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { resolveHardwareBySlugOrAlias } from "@/lib/hardware/resolve";

type Body = {
  release_id: string;
  hardware_slug?: string | null; // preferred
  hardware_id?: string | null;   // optional fallback
  note?: string | null;
  source?: "manual" | "ra_default" | "ra_manual_override" | "system_detected";
};

const ALLOWED_SOURCES = new Set<NonNullable<Body["source"]>>([
  "manual",
  "ra_default",
  "ra_manual_override",
  "system_detected",
]);

export async function POST(req: Request) {
  try {
    // 1) Auth via cookie session (RLS-safe for "who is this user?")
    const supabase = await supabaseRouteClient();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth?.user;

    if (authErr || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // 2) Parse + validate body
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;

    const release_id = String(body.release_id ?? "").trim();
    if (!release_id) {
      return NextResponse.json({ ok: false, error: "Missing release_id" }, { status: 400 });
    }

    const sourceRaw = (body.source ?? "manual") as NonNullable<Body["source"]>;
    const source = ALLOWED_SOURCES.has(sourceRaw) ? sourceRaw : "manual";

    const note = String(body.note ?? "").trim() || null;

    // 3) Resolve hardwareId from hardware_id OR hardware_slug/alias
    let hardwareId = String(body.hardware_id ?? "").trim() || null;

    if (!hardwareId) {
      const slugOrAlias = String(body.hardware_slug ?? "").trim() || null;
      if (slugOrAlias) {
        // IMPORTANT: use service role client for catalog lookup (bypasses RLS)
        const hw = await resolveHardwareBySlugOrAlias(supabaseServer, slugOrAlias);
        if (!hw) {
          return NextResponse.json(
            { ok: false, error: "Unknown hardware_slug" },
            { status: 400 }
          );
        }
        hardwareId = hw.id;
      }
    }

    // 4) If clearing played-on for this release
    if (!hardwareId) {
      const { error } = await supabaseServer
        .from("user_release_played_on")
        .delete()
        .eq("user_id", user.id)
        .eq("release_id", release_id);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    // Optional safety: verify hardwareId exists (prevents FK pain / typos)
    {
      const { data: hw, error: hwErr } = await supabaseServer
        .from("hardware")
        .select("id")
        .eq("id", hardwareId)
        .limit(1);

      if (hwErr) {
        return NextResponse.json({ ok: false, error: hwErr.message }, { status: 500 });
      }
      if (!hw || hw.length === 0) {
        return NextResponse.json({ ok: false, error: "Unknown hardware_id" }, { status: 400 });
      }
    }

    // 5) Ensure only one primary per (user, release)
    const { error: updErr } = await supabaseServer
      .from("user_release_played_on")
      .update({ is_primary: false })
      .eq("user_id", user.id)
      .eq("release_id", release_id);

    if (updErr) {
      return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
    }

    // 6) If the exact mapping row already exists, flip it primary. Otherwise insert.
    const { data: existingRows, error: selErr } = await supabaseServer
      .from("user_release_played_on")
      .select("id")
      .eq("user_id", user.id)
      .eq("release_id", release_id)
      .eq("hardware_id", hardwareId)
      .limit(1);

    if (selErr) {
      return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
    }

    const existingId = existingRows?.[0]?.id as string | undefined;

    if (existingId) {
      const { error } = await supabaseServer
        .from("user_release_played_on")
        .update({ is_primary: true, source })
        .eq("id", existingId);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    const { error: insErr } = await supabaseServer
      .from("user_release_played_on")
      .insert({
        user_id: user.id,
        release_id,
        hardware_id: hardwareId,
        source,
        is_primary: true,
      });

    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Server error" }, { status: 500 });
  }
}
