import { normalizeOriginTimeline } from "@/lib/identity/normalizeOriginTimeline";

export function unwrapOriginTimeline(input: any) {
  // Supabase rpc sometimes returns:
  //  - { stats, standouts }
  //  - { timeline: { stats, standouts } }
  //  - [ { timeline: { ... } } ]
  //  - [ { ... } ]
  const raw =
    (Array.isArray(input) ? input?.[0] : input) ?? null;

  const timeline =
    raw?.timeline ?? raw ?? null;

  return normalizeOriginTimeline(timeline);
}
