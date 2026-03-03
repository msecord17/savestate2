import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

/**
 * GET /api/admin/matches?status=needs_review or ?status=candidate,needs_review
 * Returns game_master_mappings for review UI (source_title, source_platform, source_cover_url, meta with top candidates).
 */
export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "needs_review";
  const statuses = statusParam.includes(",")
    ? statusParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [statusParam.trim()];

  const admin = adminClient();
  const query = admin
    .from("game_master_mappings")
    .select(
      "id, source, external_id, source_title, source_platform, source_cover_url, igdb_game_id, status, confidence, method, matched_name, matched_year, matched_at, meta, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  const { data, error } =
    statuses.length === 1
      ? await query.eq("status", statuses[0])
      : await query.in("status", statuses);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, matches: data ?? [] });
}
