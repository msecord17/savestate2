import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ORIGIN_BUCKET_META, ORIGIN_BUCKET_ORDER } from "@/lib/identity/era";
import {
  identitySignalsFromGetIdentitySignalsJson,
  identitySummaryFromArchetypes,
  normalizeEraKey,
  type GetIdentitySignalsJson,
} from "@/lib/identity/compute";
import { normalizeTimeline } from "@/lib/identity/normalize-timeline";
import { normalizeOriginTimeline } from "@/lib/identity/normalizeOriginTimeline";
import { computeArchetypes } from "@/lib/identity/archetypes";
import type { EraTimelineItem, TimelineResponse } from "@/lib/identity/types";

/** Share snapshot shape (card) — matches IdentityShareCard payload. */
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

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function toSharePayload(
  summary: { lifetime_score?: number; primary_archetype?: { key: string; name: string; strength: string }; secondary_archetypes?: Array<{ key: string; name: string; strength: string }>; top_signals?: Array<{ key: string; label: string; value?: number }> },
  signalsJson: GetIdentitySignalsJson | null
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
    username: null,
    lifetime_score: summary.lifetime_score != null ? Math.round(summary.lifetime_score * 100) : null,
    archetypes,
    top_signals,
    identity_signals,
  };
}

/**
 * GET /api/identity/share/[shareId]
 * No auth. Returns identity card payload + timeline for the shared user.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  const { shareId } = await params;
  if (!shareId?.trim()) return NextResponse.json({ error: "Missing shareId" }, { status: 400 });

  const admin = adminClient();

  const { data: share, error: shareErr } = await admin
    .from("user_identity_shares")
    .select("user_id, snapshot")
    .eq("share_id", shareId.trim())
    .maybeSingle();

  if (shareErr || !share?.user_id) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  const userId = share.user_id as string;

  let card: ShareSnapshot;
  if (share.snapshot && typeof share.snapshot === "object") {
    card = share.snapshot as ShareSnapshot;
  } else {
    const { data: signalsJson, error: sigErr } = await admin.rpc("get_identity_signals", {
      p_user_id: userId,
    });
    if (sigErr || signalsJson == null) {
      return NextResponse.json({ error: "Could not load identity" }, { status: 500 });
    }
    const signals = identitySignalsFromGetIdentitySignalsJson(signalsJson as GetIdentitySignalsJson);
    const results = computeArchetypes(signals);
    const sig = signalsJson as GetIdentitySignalsJson;
    const eraKey = normalizeEraKey(sig?.primary_era_key ?? sig?.top_era_weighted);
    const summary = identitySummaryFromArchetypes(results, eraKey);
    card = toSharePayload(summary, signalsJson as GetIdentitySignalsJson);
  }

  const { data: timelinePayload, error: timelineErr } = await admin.rpc("get_origin_timeline", {
    p_user_id: userId,
  });

  let timeline: TimelineResponse | null = null;
  if (!timelineErr && timelinePayload) {
    const { origin } = normalizeTimeline(timelinePayload);
    const { stats, standouts } = normalizeOriginTimeline(origin);
    const buckets = ORIGIN_BUCKET_ORDER.filter((k) => k !== "unknown");
    const s = stats ?? {};
    const so = standouts ?? {};

    const eraStats = buckets.map((key) => ({
      key,
      games: Number((s[key] as { games?: number })?.games ?? 0),
      releases: Number((s[key] as { releases?: number })?.releases ?? 0),
    }));
    eraStats.sort((a, b) => {
      if (b.games !== a.games) return b.games - a.games;
      return b.releases - a.releases;
    });
    const rankByKey: Record<string, number> = {};
    eraStats.forEach((s, i) => {
      rankByKey[s.key] = i + 1;
    });

    const eras: EraTimelineItem[] = buckets.map((bucketKey) => {
      const meta = ORIGIN_BUCKET_META[bucketKey];
      const games = Number((s[bucketKey] as { games?: number })?.games ?? 0);
      const releases = Number((s[bucketKey] as { releases?: number })?.releases ?? 0);
      const notableList = Array.isArray(so[bucketKey]) ? so[bucketKey]! : [];
      const notable = notableList.slice(0, 3).map((n) => ({
        release_id: String(n.release_id ?? ""),
        title: String(n.title ?? "Untitled"),
        cover_url: n.cover_url ?? null,
        played_on: n.played_on ?? null,
        earned: n.earned != null ? Number(n.earned) : undefined,
        total: n.total != null ? Number(n.total) : undefined,
        minutes_played: n.minutes_played != null ? Number(n.minutes_played) : undefined,
      }));

      return {
        era: bucketKey,
        label: meta?.title ?? bucketKey,
        years: meta?.sub ?? "",
        rank: rankByKey[bucketKey] ?? 0,
        games,
        releases,
        topSignals: [],
        notable,
      };
    });

    eras.sort((a, b) => {
      const ia = ORIGIN_BUCKET_ORDER.indexOf(a.era);
      const ib = ORIGIN_BUCKET_ORDER.indexOf(b.era);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

    timeline = {
      ok: true,
      user_id: userId,
      mode: "release_year",
      eras,
    };
  }

  return NextResponse.json(
    { ok: true, card, timeline: timeline ?? undefined },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}
