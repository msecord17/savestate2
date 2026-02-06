import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";
import {
  computeIdentitySummaryFromRpc,
  identitySignalsFromGetIdentitySignalsJson,
  identitySignalsFromRpcRow,
  identitySummaryFromArchetypes,
  summaryFromCollectorArchetypes,
  eraKeyFromPrimaryEra,
  type IdentityRpcRow,
  type IdentitySignalsRpcRow,
  type GetIdentitySignalsJson,
} from "@/lib/identity/compute";
import { computeArchetypes } from "@/lib/identity/archetypes";
import { computeCollectorArchetypes } from "@/lib/identity/collector-archetypes";

const CACHE_TTL_MS = 60 * 1000; // 1 minute per user
const identitySignalsCache = new Map<
  string,
  { json: GetIdentitySignalsJson | null; expires: number }
>();

function getCachedIdentitySignals(userId: string): GetIdentitySignalsJson | null | undefined {
  const entry = identitySignalsCache.get(userId);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    identitySignalsCache.delete(userId);
    return undefined;
  }
  return entry.json;
}

function setCachedIdentitySignals(userId: string, json: GetIdentitySignalsJson | null): void {
  identitySignalsCache.set(userId, { json, expires: Date.now() + CACHE_TTL_MS });
}

function toPlatformCounts(
  raw: Record<string, number> | unknown
): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v))
  );
}

const one = (d: unknown): Record<string, unknown> | null =>
  d == null ? null : Array.isArray(d) ? (d[0] as Record<string, unknown>) ?? null : (d as Record<string, unknown>);

function toSignalsRow(r: Record<string, unknown>): IdentitySignalsRpcRow {
  return {
    owned_titles: Number(r.owned_titles ?? 0),
    unique_platforms: Number(r.unique_platforms ?? 0),
    era_span_years: Number(r.era_span_years ?? 0),
    primary_era_share: Number(r.primary_era_share ?? 0),
    primary_era_count: Number(r.primary_era_count ?? 0),
    achievements_total: Number(r.achievements_total ?? 0),
    completion_count: Number(r.completion_count ?? 0),
    achievements_last_90d: Number(r.achievements_last_90d ?? 0),
    era_key: typeof r.era_key === "string" ? r.era_key : "modern",
  };
}

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes?.user) return NextResponse.json({ error: "Not logged in" }, { status: 401 });

  const userId = userRes.user.id;
  const admin = supabaseServer;

  // Prefer get_identity_signals RPC (with per-user cache) — use computed collector archetypes
  let cached = getCachedIdentitySignals(userId);
  if (cached !== undefined) {
    const era_key = eraKeyFromPrimaryEra(cached?.primary_era_key);
    const platformCounts = toPlatformCounts(cached?.platform_counts);
    const collectorArchetypes = computeCollectorArchetypes({ identity_signals: cached ?? undefined }, platformCounts);
    const summary = summaryFromCollectorArchetypes(collectorArchetypes, era_key);
    const era_buckets = cached?.era_buckets ?? null;
    const archetypes = collectorArchetypes.map((a) => ({
      key: a.key,
      label: a.label,
      strength: a.strength,
      score: a.score,
      reasons: a.reasons,
    }));
    return NextResponse.json({
      ...summary,
      era_buckets,
      identity_signals: { era_buckets },
      archetypes,
    });
  }

  try {
    const { data: rpcData } = await admin.rpc("get_identity_signals", { p_user_id: userId });
    const json = rpcData as GetIdentitySignalsJson | null | undefined;
    setCachedIdentitySignals(userId, json ?? null);
    const era_key = eraKeyFromPrimaryEra(json?.primary_era_key);
    const platformCounts = toPlatformCounts(json?.platform_counts);
    const collectorArchetypes = computeCollectorArchetypes({ identity_signals: json ?? undefined }, platformCounts);
    const summary = summaryFromCollectorArchetypes(collectorArchetypes, era_key);
    const era_buckets = json?.era_buckets ?? null;
    const archetypes = collectorArchetypes.map((a) => ({
      key: a.key,
      label: a.label,
      strength: a.strength,
      score: a.score,
      reasons: a.reasons,
    }));
    return NextResponse.json({
      ...summary,
      era_buckets,
      identity_signals: { era_buckets },
      archetypes,
    });
  } catch {
    // get_identity_signals may not exist; fall through to identity_signals then legacy
  }

  try {
    const signalsRes = await admin.rpc("identity_signals", { p_user_id: userId });
    const sigRow = one(signalsRes?.data);
    if (sigRow) {
      const signals = identitySignalsFromRpcRow(toSignalsRow(sigRow));
      const results = computeArchetypes(signals);
      const era_key = typeof sigRow.era_key === "string" ? sigRow.era_key : "modern";
      const summary = identitySummaryFromArchetypes(results, era_key);
      return NextResponse.json({
        ...summary,
        era_buckets: null,
        identity_signals: { era_buckets: null },
        archetypes: [],
      });
    }
  } catch {
    // identity_signals RPC may not exist; fall back to legacy RPCs
  }

  let platform_counts = { psn: 0, xbox: 0, steam: 0, ra: 0, platform_spread_score: 0 };
  let trophy_stats = { completion_score: 0, playtime_score: 0, has_any_completion: false };
  let era_key = "modern";

  try {
    const [countRes, trophyRes, eraRes] = await Promise.all([
      admin.rpc("identity_platform_counts", { p_user_id: userId }),
      admin.rpc("identity_trophy_stats", { p_user_id: userId }),
      admin.rpc("identity_era_anchor", { p_user_id: userId }),
    ]);

    const cr = one(countRes?.data);
    if (cr) {
      platform_counts = {
        psn: Number(cr.psn ?? 0),
        xbox: Number(cr.xbox ?? 0),
        steam: Number(cr.steam ?? 0),
        ra: Number(cr.ra ?? 0),
        platform_spread_score: Number(cr.platform_spread_score ?? 0),
      };
    }
    const tr = one(trophyRes?.data);
    if (tr) {
      trophy_stats = {
        completion_score: Number(tr.completion_score ?? 0),
        playtime_score: Number(tr.playtime_score ?? 0),
        has_any_completion: Boolean(tr.has_any_completion),
      };
    }
    const er = one(eraRes?.data);
    if (er && typeof er.era_key === "string") era_key = er.era_key;
  } catch {
    // RPCs may not exist; use defaults so response is still valid
  }

  const row: IdentityRpcRow = { platform_counts, trophy_stats, era_key };
  const summary = computeIdentitySummaryFromRpc(row);
  return NextResponse.json({
    ...summary,
    era_buckets: null,
    identity_signals: { era_buckets: null },
    archetypes: [],
  });
}
