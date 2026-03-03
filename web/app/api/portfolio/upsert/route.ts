// app/api/portfolio/upsert/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

const STATUS_ALIASES: Record<string, string> = {
  played: "completed",
  complete: "completed",
  completed: "completed",

  backlog: "back_burner",
  "back-burner": "back_burner",
  backburner: "back_burner",
  back_burner: "back_burner",

  playing: "playing",
  dropped: "dropped",
  wishlist: "wishlist",
  owned: "owned",
};

const ALLOWED = new Set([
  "playing",
  "completed",
  "dropped",
  "back_burner",
  "wishlist",
  "owned",
]);

export async function POST(req: Request) {
  const supabase = await supabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    release_id?: string;
    status?: string;
  };

  const release_id = String(body.release_id ?? "").trim();
  const statusRaw = String(body.status ?? "").trim().toLowerCase();

  if (!release_id || !statusRaw) {
    return NextResponse.json(
      { error: "Missing release_id or status" },
      { status: 400 }
    );
  }

  const status = STATUS_ALIASES[statusRaw] ?? statusRaw;

  if (!ALLOWED.has(status)) {
    return NextResponse.json(
      { error: "Invalid status", got: statusRaw, normalized: status, allowed: [...ALLOWED] },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("portfolio_entries")
    .upsert(
      { user_id: user.id, release_id, status, source: "manual" },
      { onConflict: "user_id,release_id" }
    )
    .select("id, user_id, release_id, status")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ entry: data });
}
