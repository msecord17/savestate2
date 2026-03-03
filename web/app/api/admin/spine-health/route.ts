import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const admin = adminClient();

  const { data, error } = await admin.from("v_spine_health").select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (data == null) return NextResponse.json({ ok: false, error: "View returned no row" }, { status: 500 });

  const stats = data as Record<string, unknown>;
  return NextResponse.json({ ok: true, stats });
}
