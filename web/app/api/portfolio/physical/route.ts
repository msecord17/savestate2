import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type PhysicalItemInput = {
  item_type: "game" | "console" | "accessory" | "other";
  title: string;
  platform_key?: string | null;
  platform_family?: string | null;
  region?: string | null;
  condition?: string | null;
  is_boxed?: boolean | null;
  notes?: string | null;
  linked_release_id?: string | null;
};

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("physical_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: PhysicalItemInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const item_type = body.item_type;

  if (!title || !item_type) {
    return NextResponse.json({ ok: false, error: "Missing title or item_type" }, { status: 400 });
  }

  const insertRow = {
    user_id: user.id,
    item_type,
    title,
    platform_key: body.platform_key ?? null,
    platform_family: body.platform_family ?? null,
    region: body.region ?? null,
    condition: body.condition ?? null,
    is_boxed: body.is_boxed ?? null,
    notes: body.notes ?? null,
    linked_release_id: body.linked_release_id ?? null,
  };

  const { data, error } = await supabase
    .from("physical_items")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data });
}
