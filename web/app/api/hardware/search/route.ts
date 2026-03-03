import { NextRequest, NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";

function stripBrands(q: string) {
  const stop = new Set([
    "sony", "nintendo", "sega", "microsoft", "xbox", "playstation",
    "asus", "valve", "lenovo", "msi", "gpd", "ayaneo", "ayn", "retroid",
    "anbernic", "miyoo", "powkiddy", "trimui", "logitech", "razer", "philips", "panasonic", "atari", "snk", "nec",
  ]);
  return q
    .split(/\s+/)
    .filter((t) => t && !stop.has(t.toLowerCase()))
    .join(" ")
    .trim();
}

function bestToken(q: string) {
  const parts = q.split(/\s+/).filter(Boolean);
  parts.sort((a, b) => b.length - a.length);
  return parts[0] ?? "";
}

export async function GET(req: NextRequest) {
  const rawQ = req.nextUrl.searchParams.get("q") ?? "";
  const q = rawQ.trim().slice(0, 200); // cap for logs + sanity
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 50);

  const search = async (query: string) => {
    const { data, error } = await supabaseServer.rpc("search_hardware", {
      p_q: query,
      p_limit: limit,
    });
    if (error) throw error;
    return data ?? [];
  };

  let results: Awaited<ReturnType<typeof search>> = [];
  let usedFallback = false;

  // Primary search (fail closed)
  try {
    results = await search(q);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Search failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  // Fallback searches should never crash the route
  try {
    if (!results.length) {
      const stripped = stripBrands(q);
      if (stripped && stripped !== q) {
        results = await search(stripped);
        usedFallback = results.length > 0;
      }
    }

    if (!results.length && q.includes(" ")) {
      const tok = bestToken(q);
      if (tok && tok !== q) {
        results = await search(tok);
        usedFallback = results.length > 0;
      }
    }
  } catch {
    // ignore fallback failures; we'll just return the original empty results
  }

  // Log (never break UX)
  let logStatus: any = { attempted: false };

  try {
    if (q.length > 0) {
      const supabase = await supabaseRouteClient();
      const { data: auth } = await supabase.auth.getUser();

      const { error } = await supabase.from("hardware_search_logs").insert({
        user_id: auth?.user?.id ?? null,
        query: q,
        results_count: results.length,
        used_fallback: !!usedFallback,
      });

      logStatus = error
        ? { attempted: true, ok: false, error: error.message, code: error.code }
        : { attempted: true, ok: true };
    }
  } catch (e: any) {
    logStatus = { attempted: true, ok: false, error: e?.message ?? String(e) };
  }

  return NextResponse.json({ ok: true, results, usedFallback });
}
