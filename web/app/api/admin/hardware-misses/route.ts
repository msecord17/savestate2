import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

/**
 * GET /api/admin/hardware-misses?days=14&limit=50
 * Returns top search queries that returned 0 results (for alias seeding).
 */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? "14"), 1), 90);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "50"), 1), 200);

  const admin = adminClient();
  const { data, error } = await admin.rpc("admin_hardware_misses", {
    p_days: days,
    p_limit: limit,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
