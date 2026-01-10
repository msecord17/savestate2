import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    if (!id || id === "undefined") {
      return NextResponse.json({ error: "Missing release id in URL" }, { status: 400 });
    }

    const supabase = await supabaseRouteClient();

    const { data, error } = await supabase
      .from("releases")
      .select(
        `
        id,
        display_title,
        platform_name,
        platform_key,
        cover_url,
        created_at,
        updated_at,
        game_id,
        games (
          id,
          canonical_title,
          igdb_game_id,
          summary,
          genres,
          developer,
          publisher,
          first_release_year
        )
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    return NextResponse.json({ release: data });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Failed to load release" },
      { status: 500 }
    );
  }
}
