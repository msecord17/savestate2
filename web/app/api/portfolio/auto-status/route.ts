import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

type Suggestion = {
  release_id: string;
  source: "xbox";
  suggested_status: "completed" | "playing" | "owned";
  confidence: number; // 0..100
  rationale: string;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function daysSince(iso: string | null | undefined) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!t || Number.isNaN(t)) return null;
  const ms = Date.now() - t;
  return ms / (1000 * 60 * 60 * 24);
}

function suggestFromXbox(row: any): Suggestion | null {
  const release_id = String(row.release_id ?? "").trim();
  if (!release_id) return null;

  const achEarned = Number(row.achievements_earned || 0);
  const achTotal = Number(row.achievements_total || 0);
  const gsEarned = Number(row.gamerscore_earned || 0);
  const gsTotal = Number(row.gamerscore_total || 0);

  const achPct = achTotal > 0 ? clamp(achEarned / achTotal, 0, 1) : null;
  const gsPct = gsTotal > 0 ? clamp(gsEarned / gsTotal, 0, 1) : null;

  const lastPlayed = row.last_played_at ?? null;
  const recencyDays = daysSince(lastPlayed);

  let status: "completed" | "playing" | "owned" = "owned";
  let confidence = 40;
  const rationaleBits: string[] = [];

  if (achPct != null) rationaleBits.push(`ach ${(achPct * 100).toFixed(0)}%`);
  if (gsPct != null) rationaleBits.push(`gs ${(gsPct * 100).toFixed(0)}%`);

  const strongest = Math.max(achPct ?? 0, gsPct ?? 0);

  if (strongest >= 0.85) {
    status = "completed";
    confidence = 85;
  } else if (strongest >= 0.2) {
    status = "playing";
    confidence = 70;
  } else {
    status = "owned";
    confidence = 50;
  }

  if (recencyDays != null && recencyDays <= 30) {
    rationaleBits.push("played recently");
    if (status === "owned") status = "playing";
    confidence = Math.max(confidence, 70);
  }

  return {
    release_id,
    source: "xbox",
    suggested_status: status,
    confidence,
    rationale: rationaleBits.length ? rationaleBits.join(" • ") : "xbox signal",
  };
}

export async function POST() {
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();

  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const user = userRes.user;

  // 1) Load mapped Xbox rows (release_id present)
  const { data: xbRows, error: xbErr } = await supabase
    .from("xbox_title_progress")
    .select("release_id, achievements_earned, achievements_total, gamerscore_earned, gamerscore_total, last_played_at")
    .eq("user_id", user.id)
    .not("release_id", "is", null);

  if (xbErr) return NextResponse.json({ error: xbErr.message }, { status: 500 });

  const xb = Array.isArray(xbRows) ? xbRows : [];

  const suggestions: Suggestion[] = [];
  for (const r of xb) {
    const s = suggestFromXbox(r);
    if (s) suggestions.push(s);
  }

  if (suggestions.length === 0) {
    return NextResponse.json({
      ok: true,
      applied: 0,
      inserted: 0,
      considered: 0,
      note: "No mapped Xbox titles found (run Xbox sync + map first).",
    });
  }

  // 2) Load existing portfolio entries for those releases
  const releaseIds = suggestions.map((s) => s.release_id);

  const { data: entries, error: eErr } = await supabase
    .from("portfolio_entries")
    .select("release_id, status")
    .eq("user_id", user.id)
    .in("release_id", releaseIds);

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });

  const entryByRelease = new Map<string, any>();
  for (const e of Array.isArray(entries) ? entries : []) {
    entryByRelease.set(String((e as any).release_id), e);
  }

  // 3) Apply conservative updates:
  // - If entry exists: only update if status === "owned"
  // - If entry missing: insert with suggested status
  let applied = 0;
  let inserted = 0;

  for (const s of suggestions) {
    const existing = entryByRelease.get(s.release_id);

    if (!existing) {
      const { error: insErr } = await supabase.from("portfolio_entries").insert({
        user_id: user.id,
        release_id: s.release_id,
        status: s.suggested_status,
        updated_at: new Date().toISOString(),
      });

      if (!insErr) inserted += 1;
      continue;
    }

    const currentStatus = String(existing.status || "owned");
    if (currentStatus !== "owned") continue;

    if (s.suggested_status === "owned") continue;

    const { error: updErr } = await supabase
      .from("portfolio_entries")
      .update({
        status: s.suggested_status,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("release_id", s.release_id);

    if (!updErr) applied += 1;
  }

  return NextResponse.json({
    ok: true,
    considered: suggestions.length,
    applied,
    inserted,
    sample: suggestions.slice(0, 10),
    note:
      "Conservative mode: only upgrades entries still marked 'owned'. It will not overwrite wishlist/back_burner/playing/completed.",
  });
}
