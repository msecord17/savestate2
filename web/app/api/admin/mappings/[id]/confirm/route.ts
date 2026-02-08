import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST: set game_master_mappings.status = 'confirmed' for the given mapping id.
 * Confirmed mappings are never auto-changed by sync.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id?.trim()) return NextResponse.json({ error: "Missing mapping id" }, { status: 400 });

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("game_master_mappings")
    .update({ status: "confirmed", method: "manual", confirmed_at: now, updated_at: now })
    .eq("id", id.trim())
    .select("id, source, external_id, igdb_game_id, status")
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
    source: data.source,
    external_id: data.external_id,
    igdb_game_id: data.igdb_game_id,
    status: data.status,
  });
}
