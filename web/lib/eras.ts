// web/lib/eras.ts

import { ORIGIN_BUCKET_META } from "@/lib/identity/era";
import { toEraKey } from "@/lib/identity/eras";

export type TimelineEraKey = keyof typeof ORIGIN_BUCKET_META;

/** Back-compat: getEraMeta returns { key, label, years, order } where label=title, years=sub. */
export function getEraMeta(input: string | null | undefined) {
  const key = toEraKey(input ?? "");
  const meta = ORIGIN_BUCKET_META[key] ?? ORIGIN_BUCKET_META.unknown;
  return {
    key,
    label: meta.title,
    years: meta.sub,
    order: meta.order,
  };
}

export function sortEraKeys(keys: string[]): string[] {
  return keys
    .map((k) => toEraKey(k))
    .filter((k) => k !== "unknown")
    .sort((a, b) => (ORIGIN_BUCKET_META[a]?.order ?? 999) - (ORIGIN_BUCKET_META[b]?.order ?? 999));
}

/** @deprecated Use ORIGIN_BUCKET_META from @/lib/identity/era. Re-exported for { label, years } compat. */
export { ERA_META } from "@/lib/identity/eras";
