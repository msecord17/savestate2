import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET() {
  const { data, error } = await supabaseServer
    .from("hardware")
    .select("id, slug, display_name, manufacturer, kind, era_key, is_modern_retro_handheld")
    .order("kind", { ascending: true })
    .order("display_name", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}
