import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import {
  identitySignalsFromGetIdentitySignalsJson,
  identitySummaryFromArchetypes,
  eraKeyFromPrimaryEra,
  type GetIdentitySignalsJson,
} from "@/lib/identity/compute";
import { computeArchetypes } from "@/lib/identity/archetypes";
import type { IdentitySummaryApiResponse } from "@/lib/identity/types";
import IdentityShareCard from "@/components/identity/IdentityShareCard";

/** Build SharePayload for the public share card from summary + optional RPC signals. */
function toSharePayload(
  summary: IdentitySummaryApiResponse,
  signalsJson?: GetIdentitySignalsJson | null,
  username?: string | null
): {
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
} {
  const archetypes = [
    summary.primary_archetype,
    ...(summary.secondary_archetypes ?? []),
  ]
    .filter(Boolean)
    .map((a) => ({
      key: a!.key,
      label: a!.name,
      strength: a!.strength,
    }));

  const top_signals = (summary.top_signals ?? []).slice(0, 4).map((t) => ({
    key: t.key,
    label: t.label,
    value: `${Math.round((t.value ?? 0) * 100)}%`,
  }));

  let identity_signals: {
    owned_games?: number;
    owned_releases?: number;
    unique_platforms?: number;
    achievements_earned?: number;
    achievements_total?: number;
    minutes_played?: number;
    era_buckets?: Record<string, { games: number; releases: number }>;
  } | undefined;

  if (signalsJson && typeof signalsJson === "object") {
    const ej = signalsJson as GetIdentitySignalsJson;
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
  } else if (summary.era_buckets && typeof summary.era_buckets === "object") {
    identity_signals = {
      era_buckets: Object.fromEntries(
        Object.entries(summary.era_buckets).map(([k, v]) => [
          k,
          { games: Number(v?.games ?? 0), releases: Number(v?.releases ?? 0) },
        ])
      ) as Record<string, { games: number; releases: number }>,
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

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const admin = supabaseServer;

  const { data: share } = await admin
    .from("user_identity_shares")
    .select("user_id, snapshot")
    .eq("share_id", shareId)
    .maybeSingle();

  if (!share?.user_id) return notFound();

  // Use snapshot if present (static; no RPC — snapshot is SharePayload from POST /api/identity/share)
  if (share.snapshot && typeof share.snapshot === "object") {
    return <IdentityShareCard data={share.snapshot as Parameters<typeof IdentityShareCard>[0]["data"]} />;
  }

  // Compute live from get_identity_signals RPC
  const { data: signalsJson, error } = await admin.rpc("get_identity_signals", {
    p_user_id: share.user_id,
  });

  if (error || signalsJson == null) return notFound();

  const signals = identitySignalsFromGetIdentitySignalsJson(
    signalsJson as GetIdentitySignalsJson
  );
  const results = computeArchetypes(signals);
  const eraKey = eraKeyFromPrimaryEra(
    (signalsJson as GetIdentitySignalsJson)?.primary_era_key
  );
  const summary = identitySummaryFromArchetypes(results, eraKey);
  const payload = toSharePayload(summary, signalsJson as GetIdentitySignalsJson, null);

  return <IdentityShareCard data={payload} />;
}
