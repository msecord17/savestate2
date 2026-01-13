import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  }

  const user = userRes.user;

  // 1) Profile fields (what PSN connection data exists?)
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("user_id, psn_npsso, psn_account_id, psn_connected_at, psn_last_synced_at, psn_last_sync_count")
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });

  // 2) Count PSN progress rows
  const { count, error: cErr } = await supabase
    .from("psn_title_progress")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (cErr) return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });

  // 3) Sample 5 rows so we know what columns we really have
  const { data: sample, error: sErr } = await supabase
    .from("psn_title_progress")
    .select("*")
    .eq("user_id", user.id)
    .limit(5);

  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email },
    profile: profile ?? null,
    psn_title_progress_count: count ?? 0,
    psn_title_progress_sample: sample ?? [],
  });
}
