import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Search platforms by keyword. Matches platform_key, display_name, aliases. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q")?.trim();
  if (!query || query.length < 2) {
    return NextResponse.json({ ok: true, results: [] });
  }

  const { data, error } = await supabaseServer.rpc("search_platforms", {
    p_query: query,
  });

  if (error) {
    console.error("[platforms/search] RPC error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, results: data ?? [] });
}
