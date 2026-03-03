import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET(req: Request) {
  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ remembered: [] }, { status: 200 });
  }

  const url = new URL(req.url);
  const releaseIdsParam = url.searchParams.get("release_ids") ?? "";
  const releaseIds = releaseIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (releaseIds.length === 0) {
    return NextResponse.json({ remembered: [] });
  }

  const { data, error } = await supabase
    .from("user_memory_titles")
    .select("release_id")
    .eq("user_id", user.id)
    .in("release_id", releaseIds);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const remembered = (data ?? []).map((r: { release_id: string }) => r.release_id);
  return NextResponse.json({ remembered });
}
