import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export async function POST() {
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }
  const user = userRes.user;

  const { data: psnRows, error: pErr } = await supabase
    .from("psn_title_progress")
    .select("release_id, title_name, last_updated_at, playtime_minutes")
    .eq("user_id", user.id);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const rows = Array.isArray(psnRows) ? psnRows : [];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, skipped: 0, note: "No PSN titles found." });
  }

  const recentCutoff = daysAgoIso(21);

  let updated = 0;
  let skipped = 0;

  const skipReasons: Record<string, number> = {
    no_release_id: 0,
    no_last_updated_at: 0,
    entry_missing: 0,
    immutable_status: 0,
    already_same_status: 0,
    update_failed: 0,
  };

  const sampleSkipped: any[] = [];

  for (const r of rows as any[]) {
    const releaseId = r.release_id as string | null;

    if (!releaseId) {
      skipped += 1;
      skipReasons.no_release_id += 1;
      if (sampleSkipped.length < 8) sampleSkipped.push({ title: r.title_name, reason: "no_release_id" });
      continue;
    }

    const lastUpdated = r.last_updated_at ? new Date(r.last_updated_at).toISOString() : null;
    if (!lastUpdated) {
      skipped += 1;
      skipReasons.no_last_updated_at += 1;
      if (sampleSkipped.length < 8) sampleSkipped.push({ title: r.title_name, reason: "no_last_updated_at" });
      continue;
    }

    const isRecent = lastUpdated >= recentCutoff;
    const nextStatus = isRecent ? "playing" : null;

    if (!nextStatus) {
      // We only auto-set playing in this version; non-recent = leave alone
      skipped += 1;
      skipReasons.already_same_status += 1; // “no-op” bucket
      if (sampleSkipped.length < 8) sampleSkipped.push({ title: r.title_name, reason: "not_recent_noop" });
      continue;
    }

    // Read entry status
    const { data: entry, error: eErr } = await supabase
      .from("portfolio_entries")
      .select("status")
      .eq("user_id", user.id)
      .eq("release_id", releaseId)
      .maybeSingle();

    if (eErr) {
      skipped += 1;
      skipReasons.entry_missing += 1;
      if (sampleSkipped.length < 8) sampleSkipped.push({ title: r.title_name, reason: "entry_lookup_failed" });
      continue;
    }

    const current = String(entry?.status || "");
    if (!current) {
      skipped += 1;
      skipReasons.entry_missing += 1;
      if (sampleSkipped.length < 8) sampleSkipped.push({ title: r.title_name, reason: "entry_missing" });
      continue;
    }

    const immutable = new Set(["completed", "dropped"]);
    if (immutable.has(current)) {
      skipped += 1;
      skipReasons.immutable_status += 1;
      if (sampleSkipped.length < 8) sampleSkipped.push({ title: r.title_name, reason: `immutable_${current}` });
      continue;
    }

    if (current === nextStatus) {
      skipped += 1;
      skipReasons.already_same_status += 1;
      if (sampleSkipped.length < 8) sampleSkipped.push({ title: r.title_name, reason: "already_playing" });
      continue;
    }

    const { error: uErr } = await supabase
      .from("portfolio_entries")
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("release_id", releaseId);

    if (uErr) {
      skipped += 1;
      skipReasons.update_failed += 1;
      if (sampleSkipped.length < 8) sampleSkipped.push({ title: r.title_name, reason: "update_failed" });
      continue;
    }

    updated += 1;
  }

  return NextResponse.json({
    ok: true,
    updated,
    skipped,
    cutoff_days: 21,
    skip_reasons: skipReasons,
    sample_skipped: sampleSkipped,
    note: "Auto-status sets 'playing' for recently updated PSN titles, without overwriting completed/dropped.",
  });
}
