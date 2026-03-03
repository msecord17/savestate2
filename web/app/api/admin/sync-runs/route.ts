import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const url = new URL(req.url);
  const platform = (url.searchParams.get("platform") ?? "").trim();
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "1", 10) || 1, 10);

  const admin = adminClient();

  let q = admin
    .from("sync_runs")
    .select("id, platform, status, started_at, finished_at, duration_ms, error_message, result_json")
    .eq("user_id", gate.user.id)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (platform) q = q.eq("platform", platform);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
