// lib/identity/era_mapping.ts
// Compatibility barrel.
// Some files import "@/lib/identity/era_mapping" (underscore).
// Your canonical file is "era-mapping.ts" (hyphen). On Vercel/Linux, name mismatches bite hard.
// This shim makes the import path stable and exports the helpers callers actually need.

export { normalizeEraKey } from "@/lib/identity/normalize-era-key";
export {
  normalizeEraKeyToTimeline,
  normalizeTopEraForProfile,
} from "@/lib/identity/era-mapping";

export type { TimelineEraKey } from "@/lib/identity/era-mapping";
