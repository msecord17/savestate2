import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export const dynamic = "force-dynamic";

function bucketFromYear(y: number | null) {
  if (!y || y <= 0) return "unknown";
  if (y <= 1977) return "gen1_1972_1977";
  if (y <= 1982) return "gen2_1978_1982";
  if (y <= 1989) return "gen3_1983_1989";
  if (y <= 1995) return "gen4_1990_1995";
  if (y <= 1999) return "gen5_1996_1999";
  if (y <= 2005) return "gen6_2000_2005";
  if (y <= 2012) return "gen7_2006_2012";
  if (y <= 2019) return "gen8_2013_2019";
  return "gen9_2020_plus";
}

function summarize(payload: any) {
  const games = Array.isArray(payload?.games) ? payload.games : [];
  const years = games
    .map((g: any) => g?.year ?? g?.first_release_year)
    .filter((y: any) => typeof y === "number" && y > 0) as number[];

  const counts: Record<string, number> = {};
  for (const y of years) {
    const k = bucketFromYear(y);
    counts[k] = (counts[k] ?? 0) + 1;
  }

  const top_bucket =
    Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]?.[0] ?? "unknown";

  return {
    games_count: games.length,
    top_bucket,
  };
}

export async function GET() {
  // If logged in, prefer latest session for user
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  let session: any = null;

  if (user) {
    const { data, error } = await supabaseServer
      .from("quiz_sessions")
      .select("id, created_at, payload")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    session = data;
  } else {
    const cookieStore = await cookies();
    const id = cookieStore.get("gh_quiz_session")?.value ?? null;
    if (id) {
      const { data, error } = await supabaseServer
        .from("quiz_sessions")
        .select("id, created_at, payload")
        .eq("id", id)
        .maybeSingle();

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      session = data;
    }
  }

  if (!session) return NextResponse.json({ ok: true, session: null });

  const summary = summarize(session.payload);

  return NextResponse.json({
    ok: true,
    session: {
      id: session.id,
      created_at: session.created_at,
      ...summary,
    },
  });
}
