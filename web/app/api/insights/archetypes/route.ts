import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { getUserStats } from "@/lib/insights/user-stats";
import { computeArchetypes } from "@/lib/archetypes/score";
import { recomputeArchetypesForUser } from "@/lib/insights/recompute";
import type { SnapshotPayload } from "@/lib/insights/recompute";
import { computeDeltas, composeInsight } from "@/lib/insights/compose-insight";

const STALE_HOURS = 24;

function isNewPayload(p: unknown): p is SnapshotPayload {
  return (
    p != null &&
    typeof p === "object" &&
    "archetypes" in p &&
    (p as SnapshotPayload).archetypes != null &&
    "top" in (p as SnapshotPayload).archetypes
  );
}

export async function GET() {
  const supabaseUser = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userRes?.user) return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });

  const userId = userRes.user.id;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: snap } = await admin
    .from("user_archetype_snapshots")
    .select("payload, computed_at")
    .eq("user_id", userId)
    .maybeSingle();

  const computedAt = snap?.computed_at ? new Date(snap.computed_at).getTime() : 0;
  const ageHours = computedAt ? (Date.now() - computedAt) / (1000 * 60 * 60) : Infinity;
  const payloadRaw = snap?.payload;

  if (payloadRaw && ageHours <= STALE_HOURS) {
    const payload = payloadRaw as SnapshotPayload;
    const latest = isNewPayload(payload) ? payload : null;

    let previous: SnapshotPayload | null = null;
    const { data: historyRows } = await admin
      .from("user_archetype_snapshots_history")
      .select("payload, computed_at")
      .eq("user_id", userId)
      .order("computed_at", { ascending: false })
      .limit(2);

    if (historyRows && historyRows.length >= 2 && latest) {
      const prevRow = historyRows[1];
      if (prevRow?.payload && isNewPayload(prevRow.payload)) {
        previous = prevRow.payload as SnapshotPayload;
      }
    }

    const deltas = latest && previous ? computeDeltas(latest, previous) : null;
    const primaryEra = latest?.archetypes?.primary_era ?? null;
    const primaryArchetype = latest?.archetypes?.primary_archetype ?? null;
    const insight = composeInsight(primaryEra, primaryArchetype, deltas);

    return NextResponse.json({
      ok: true,
      payload,
      stale: false,
      deltas: deltas ?? undefined,
      insight,
    });
  }

  await recomputeArchetypesForUser(admin, userId);

  const { data: newSnap } = await admin
    .from("user_archetype_snapshots")
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();

  const payload = (newSnap?.payload ?? null) as SnapshotPayload | null;
  const primaryEra = payload?.archetypes?.primary_era ?? null;
  const primaryArchetype = payload?.archetypes?.primary_archetype ?? null;
  const insight = composeInsight(primaryEra, primaryArchetype, null);

  return NextResponse.json({
    ok: true,
    payload: payload ?? { version: "v0", computed_at: new Date().toISOString(), stats: {} as never, archetypes: { primary_archetype: null, primary_era: null, top: [], all: [] } },
    stale: true,
    insight,
  });
}
