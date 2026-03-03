export type PhysicalCondition = "new" | "like_new" | "good" | "fair" | "poor";

export function normalizeCondition(input: unknown): PhysicalCondition | null {
  const raw = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!raw) return null;

  // already-valid
  if (raw === "new" || raw === "like_new" || raw === "good" || raw === "fair" || raw === "poor") return raw;

  // common synonyms
  if (["sealed", "mint", "bnib", "brand new"].includes(raw)) return "new";
  if (["excellent", "near mint", "very good", "vg", "great"].includes(raw)) return "like_new";
  if (["used", "ok", "okay"].includes(raw)) return "good";
  if (["acceptable", "rough"].includes(raw)) return "fair";
  if (["bad", "broken", "for parts", "parts"].includes(raw)) return "poor";

  // if someone sends "cib" / "loose" / "boxed" etc, that's NOT condition — it's completeness.
  // for now, fall back to "good" instead of hard-failing.
  return "good";
}
