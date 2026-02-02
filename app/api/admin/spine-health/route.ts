import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await admin.from("v_spine_health").select("*").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (data == null) return NextResponse.json({ ok: false, error: "View returned no row" }, { status: 500 });

  const stats = data as Record<string, unknown>;
  return NextResponse.json({ ok: true, stats });
}
