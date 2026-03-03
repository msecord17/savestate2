import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const kind = (searchParams.get("kind") || "").trim(); // optional
  const q = (searchParams.get("q") || "").trim().toLowerCase(); // optional

  let query = supabaseServer
    .from("hardware_catalog")
    .select("id,hardware_key,kind,brand,canonical_name,era_key,first_release_year,image_url")
    .order("canonical_name", { ascending: true });

  if (kind) query = query.eq("kind", kind);

  // super-light search (aliases later if you want)
  if (q) query = query.ilike("canonical_name", `%${q}%`);

  const { data, error } = await query;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, items: data ?? [] });
}
