import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function GET() {
  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const { data, error } = await supabase
    .from("list_items")
    .select(
      `
      release_id,
      lists (
        id,
        title,
        name
      )
    `
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const byRelease: Record<
    string,
    { id: string; title: string }[]
  > = {};

  for (const row of data ?? []) {
    const rId = row.release_id as string;
    const l = row.lists as any;
    if (!rId || !l) continue;

    if (!byRelease[rId]) byRelease[rId] = [];
    byRelease[rId].push({
      id: l.id,
      title: (l.title ?? l.name) || "Untitled list",
    });
  }

  return NextResponse.json({ memberships: byRelease });
}
