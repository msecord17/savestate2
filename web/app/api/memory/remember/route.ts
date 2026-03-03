import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: Request) {
  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  let body: { release_id?: string; platform_key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const release_id = body?.release_id?.trim();
  if (!release_id) {
    return NextResponse.json({ error: "Missing release_id" }, { status: 400 });
  }

  const platform_key = body?.platform_key?.trim() || null;

  const { data, error } = await supabase
    .from("user_memory_titles")
    .upsert(
      { user_id: user.id, release_id, platform_key, remembered_at: new Date().toISOString() },
      { onConflict: "user_id,release_id" }
    )
    .select("id, release_id, remembered_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, remembered: data });
}

export async function DELETE(req: Request) {
  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const url = new URL(req.url);
  const release_id = url.searchParams.get("release_id")?.trim();
  if (!release_id) {
    return NextResponse.json({ error: "Missing release_id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_memory_titles")
    .delete()
    .eq("user_id", user.id)
    .eq("release_id", release_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, forgotten: true });
}
