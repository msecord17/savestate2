import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

/**
 * POST /api/admin/matches/[id]/reject
 * Set game_master_mappings.status = 'rejected'.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const { id } = await params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = adminClient();
  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("game_master_mappings")
    .update({ status: "rejected", updated_at: now })
    .eq("id", id.trim())
    .select("id, source, external_id, status")
    .single();

  if (error) {
    if ((error as { code?: string })?.code === "PGRST116") {
      return NextResponse.json({ error: "Mapping not found" }, { status: 404 });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    mapping_id: data.id,
    status: data.status,
  });
}
