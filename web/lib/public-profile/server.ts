import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  getPublicProfileByUsername,
  type PublicProfilePayload,
} from "@/lib/public-profile";

export async function getPublicProfilePayload(
  username: string
): Promise<PublicProfilePayload | { private: true } | { error: "Not found" }> {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const result = await getPublicProfileByUsername(admin, username);

  if ("notFound" in result && result.notFound) return { error: "Not found" };
  if ("private" in result && result.private) return { private: true };

  // ---- Normalize legacy era bucket breakdown -> timeline era buckets ----
  // We treat the timeline as canonical for "genX_YYYY_YYYY" buckets.
  try {
    const payload = result as any;

    const legacyEraBuckets = payload?.identity?.era_buckets ?? null;
    const timelineEras: Array<{ era: string; games?: number; releases?: number }> =
      payload?.timeline?.eras ?? [];

    if (Array.isArray(timelineEras) && timelineEras.length > 0) {
      const eraBucketsTimeline = timelineEras.reduce<Record<string, { games: number; releases: number }>>(
        (acc, e) => {
          if (!e?.era) return acc;
          acc[e.era] = {
            games: Number(e.games ?? 0),
            releases: Number(e.releases ?? 0),
          };
          return acc;
        },
        {}
      );

      // Preserve the legacy buckets for debugging / back-compat
      if (legacyEraBuckets && !payload.identity.era_buckets_legacy) {
        payload.identity.era_buckets_legacy = legacyEraBuckets;
      }

      // Canonical buckets used by UI going forward
      payload.identity.era_buckets_timeline = eraBucketsTimeline;
      payload.identity.era_buckets = eraBucketsTimeline;
    }
  } catch {
    // If anything goes weird, we just return the original payload untouched.
  }

  return result as PublicProfilePayload;
}
