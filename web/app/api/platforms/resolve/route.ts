import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Resolve human-friendly slug to canonical platform_key. e.g. nintendo-64 -> n64 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json({ ok: false, error: "Missing slug" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("resolve_platform_slug", {
    p_slug: slug,
  });

  if (error) {
    console.error("[platforms/resolve] RPC error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const platform_key = data ?? null;
  return NextResponse.json({ ok: true, platform_key });
}
