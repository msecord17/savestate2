import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function POST(req: Request) {
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const user = userRes.user;

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const npsso = String(body?.npsso ?? "").trim();
  const onlineId = String(body?.onlineId ?? "").trim();

  if (!npsso || npsso.length < 30) {
    return NextResponse.json({ error: "Missing NPSSO" }, { status: 400 });
  }

  const { error } = await supabase.from("profiles").upsert({
    user_id: user.id,
    psn_npsso: npsso,
    psn_online_id: onlineId || null,
    psn_connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
