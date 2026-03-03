import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const days = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("days") ?? "14", 10), 1), 90);
  const limit = Math.min(Math.max(parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10), 1), 200);

  const admin = adminClient();
  const { data, error } = await admin.rpc("admin_hardware_misses", {
    p_days: days,
    p_limit: limit,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, days, limit, rows: data ?? [] });
}
