import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";
import {
  identitySignalsFromGetIdentitySignalsJson,
  identitySummaryFromArchetypes,
  eraKeyFromPrimaryEra,
  type GetIdentitySignalsJson,
} from "@/lib/identity/compute";
import { computeArchetypes } from "@/lib/identity/archetypes";

function nowIso() {
  return new Date().toISOString();
}

function makeShareId() {
  return crypto.randomUUID().replaceAll("-", "");
}

/** Snapshot shape stored in user_identity_shares — matches SharePayload for IdentityShareCard. */
type ShareSnapshot = {
  username?: string | null;
  lifetime_score?: number | null;
  archetypes: Array<{ key: string; label: string; strength: "emerging" | "strong" | "core"; score?: number }>;
  top_signals: Array<{ key: string; label: string; value: string }>;
  identity_signals?: {
    owned_games?: number;
    owned_releases?: number;
    unique_platforms?: number;
    achievements_earned?: number;
    achievements_total?: number;
    minutes_played?: number;
    era_buckets?: Record<string, { games: number; releases: number }>;
  };
};

function buildSnapshot(
  summary: {
    lifetime_score?: number;
    primary_archetype?: { key: string; name: string; strength: string };
    secondary_archetypes?: Array<{ key: string; name: string; strength: string }>;
    top_signals?: Array<{ key: string; label: string; value?: number }>;
  },
  signalsJson: GetIdentitySignalsJson | null,
  username: string | null
): ShareSnapshot {
  const archetypes = [
    summary.primary_archetype,
    ...(summary.secondary_archetypes ?? []),
  ]
    .filter(Boolean)
    .map((a) => ({
      key: a!.key,
      label: a!.name,
      strength: a!.strength as "emerging" | "strong" | "core",
    }));

  const top_signals = (summary.top_signals ?? []).slice(0, 4).map((t) => ({
    key: t.key,
    label: t.label,
    value: `${Math.round((t.value ?? 0) * 100)}%`,
  }));

  let identity_signals: ShareSnapshot["identity_signals"] | undefined;
  if (signalsJson && typeof signalsJson === "object") {
    const ej = signalsJson;
    const buckets = ej.era_buckets;
    const normalizedBuckets =
      buckets && typeof buckets === "object"
        ? (Object.fromEntries(
            Object.entries(buckets).map(([k, v]) => [
              k,
              { games: Number(v?.games ?? 0), releases: Number(v?.releases ?? 0) },
            ])
          ) as Record<string, { games: number; releases: number }>)
        : undefined;
    identity_signals = {
      owned_games: ej.owned_games != null ? Number(ej.owned_games) : undefined,
      owned_releases: ej.owned_releases != null ? Number(ej.owned_releases) : undefined,
      unique_platforms: ej.unique_platforms != null ? Number(ej.unique_platforms) : undefined,
      achievements_earned: ej.achievements_earned != null ? Number(ej.achievements_earned) : undefined,
      achievements_total: ej.achievements_total != null ? Number(ej.achievements_total) : undefined,
      minutes_played: ej.minutes_played != null ? Number(ej.minutes_played) : undefined,
      era_buckets: normalizedBuckets,
    };
  }

  return {
    username: username ?? null,
    lifetime_score:
      summary.lifetime_score != null
        ? Math.round(summary.lifetime_score * 100)
        : null,
    archetypes,
    top_signals,
    identity_signals,
  };
}

export async function POST() {
  const supabase = await supabaseRouteClient();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) {
    return NextResponse.json({ ok: false, error: "Not logged in" }, { status: 401 });
  }

  const admin = supabaseServer;
  const userId = userRes.user.id;
  const user = userRes.user;

  // Resolve username for snapshot (optional)
  const username: string | null =
    (user.user_metadata?.username as string) ??
    (user.email?.includes("@") ? user.email.replace(/@.*$/, "").trim() : user.email?.trim() ?? null) ??
    null;

  // Compute identity snapshot: call existing identity compute (get_identity_signals + archetypes)
  let snapshot: ShareSnapshot;
  try {
    const { data: signalsJson, error: rpcErr } = await admin.rpc("get_identity_signals", {
      p_user_id: userId,
    });
    if (rpcErr || signalsJson == null) {
      // No library/signals: store a minimal snapshot so share page stays static
      snapshot = buildSnapshot(
        {
          lifetime_score: 0,
          primary_archetype: { key: "explorer", name: "Explorer", strength: "emerging" },
          secondary_archetypes: [],
          top_signals: [],
        },
        null,
        username
      );
    } else {
      const json = signalsJson as GetIdentitySignalsJson;
      const signals = identitySignalsFromGetIdentitySignalsJson(json);
      const results = computeArchetypes(signals);
      const eraKey = eraKeyFromPrimaryEra(json?.primary_era_key);
      const summary = identitySummaryFromArchetypes(results, eraKey);
      snapshot = buildSnapshot(summary, json, username);
    }
  } catch {
    snapshot = buildSnapshot(
      {
        lifetime_score: 0,
        primary_archetype: { key: "explorer", name: "Explorer", strength: "emerging" },
        secondary_archetypes: [],
        top_signals: [],
      },
      null,
      username
    );
  }

  // Find existing share for user (keep stable link)
  const { data: existing } = await admin
    .from("user_identity_shares")
    .select("id, share_id")
    .eq("user_id", userId)
    .maybeSingle();

  const shareId = existing?.share_id ?? makeShareId();

  const { error: upErr } = await admin
    .from("user_identity_shares")
    .upsert(
      {
        user_id: userId,
        share_id: shareId,
        snapshot,
        updated_at: nowIso(),
      },
      { onConflict: "user_id" }
    );

  if (upErr) {
    // Fallback when unique(user_id) not present: update or insert
    if (existing?.id) {
      const { error: updErr } = await admin
        .from("user_identity_shares")
        .update({ share_id: shareId, snapshot, updated_at: nowIso() })
        .eq("id", existing.id);
      if (updErr) {
        return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 });
      }
    } else {
      const { error: insErr } = await admin.from("user_identity_shares").insert({
        user_id: userId,
        share_id: shareId,
        snapshot,
        updated_at: nowIso(),
      });
      if (insErr) {
        return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    share_url: `/share/${shareId}`,
    share_id: shareId,
  });
}
