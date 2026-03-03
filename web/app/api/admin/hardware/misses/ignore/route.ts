import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/requireAdmin";
import { adminClient } from "@/lib/supabase/admin-client";

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const query = String(body.query ?? "").trim().slice(0, 200);

  if (!query) {
    return NextResponse.json({ ok: false, error: "query is required" }, { status: 400 });
  }

  const admin = adminClient();

  // Idempotent: ignore same query multiple times safely (query_norm unique index handles it)
  const { error } = await admin
    .from("hardware_search_miss_ignores")
    .upsert(
      { query, created_by: gate.user.id },
      { onConflict: "query_norm" }
    );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
