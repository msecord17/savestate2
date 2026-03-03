// app/api/physical/items/route.ts
import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET() {
  try {
    const supabase = await supabaseRouteClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("physical_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (err: any) {
    console.error("GET /api/physical/items", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRouteClient();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();

    const payload = {
      user_id: user.id,
      item_type: String(body.item_type ?? "game"),
      title: String(body.title ?? "").trim(),
      platform_key: body.platform_key ? String(body.platform_key).trim() : null,
      condition: body.condition ? String(body.condition).trim() : null,
      region: body.region ? String(body.region).trim() : null,
      quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : 1,
      acquired_date: body.acquired_date ? String(body.acquired_date) : null,
      notes: body.notes ? String(body.notes) : null,
      release_id: body.release_id ?? null,
      game_id: body.game_id ?? null,
    };

    if (!payload.title) {
      return NextResponse.json({ ok: false, error: "Title required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("physical_items")
      .insert(payload)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ ok: true, item: data });
  } catch (err: any) {
    console.error("POST /api/physical/items", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
