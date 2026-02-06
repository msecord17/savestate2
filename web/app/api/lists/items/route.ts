import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

export async function POST(req: Request) {
  const supabase = await supabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const list_id = body?.list_id;
  const release_id = body?.release_id;

  if (!list_id || !release_id) {
    return NextResponse.json({ error: "list_id and release_id required" }, { status: 400 });
  }

  const { error } = await supabase
  .from("list_items")
  .upsert({ list_id, release_id }, { onConflict: "list_id,release_id" });

  if (error && (error.message || "").toLowerCase().includes("duplicate")) {
    return NextResponse.json({ ok: true, already: true });
  }
  

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
    const supabase = await supabaseRoute();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  
    const body = await req.json().catch(() => ({}));
    const list_id = body?.list_id as string | undefined;
    const release_id = body?.release_id as string | undefined;
  
    if (!list_id || !release_id) {
      return NextResponse.json({ error: "Missing list_id or release_id" }, { status: 400 });
    }
  
    const { error } = await supabase
      .from("list_items")
      .delete()
      .eq("list_id", list_id)
      .eq("release_id", release_id);
  
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
    return NextResponse.json({ ok: true });
  }
  
