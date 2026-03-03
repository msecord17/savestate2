import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const hardware_id = String(body.hardware_id ?? "").trim();
  const alias = String(body.alias ?? "").trim().slice(0, 200);

  if (!hardware_id || !alias) {
    return NextResponse.json({ ok: false, error: "hardware_id and alias are required" }, { status: 400 });
  }

  const admin = adminClient();

  // Validate hardware exists (prevents FK errors / bad ids)
  const { data: hw, error: hwErr } = await admin
    .from("hardware")
    .select("id")
    .eq("id", hardware_id)
    .single();

  if (hwErr || !hw?.id) {
    return NextResponse.json({ ok: false, error: "Hardware not found" }, { status: 404 });
  }

  // Idempotent: inserting the same (hardware_id, alias) again won't create a duplicate
  const { error } = await admin
    .from("hardware_aliases")
    .upsert({ hardware_id, alias }, { onConflict: "hardware_id,alias" });

  if (error) {
    // surfaces alias hygiene trigger messages
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
