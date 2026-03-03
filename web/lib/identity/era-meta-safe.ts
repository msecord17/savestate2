import { ERA_META } from "@/lib/identity/eras";

export function getEraMetaSafe(eraKey: string | null | undefined): {
  key: string;
  label: string;
  years: string;
} | null {
  const key = String(eraKey ?? "").trim();
  if (!key || key === "unknown") return null;

  const meta = (ERA_META as Record<string, { label?: string; years?: string }>)[key];
  if (meta?.label) {
    return { key, label: String(meta.label), years: String(meta.years ?? "") };
  }

  // Fallback: if key looks like genX_YYYY_YYYY or genX_YYYY_plus
  const mRange = key.match(/_(\d{4})_(\d{4})$/);
  if (mRange) {
    return { key, label: key, years: `${mRange[1]}–${mRange[2]}` };
  }
  const mPlus = key.match(/_(\d{4})_plus$/);
  if (mPlus) {
    return { key, label: key, years: `${mPlus[1]}+` };
  }

  return { key, label: key, years: "" };
}
