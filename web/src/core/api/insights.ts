import { apiGet } from "./client";

export type InsightsArchetype = {
  key: string;
  name: string;
  tier: "emerging" | "strong" | "core" | null;
  reasons: Array<{ label: string; value: string; confidence: string }>;
};

export type InsightsPayload = {
  payload?: {
    archetypes?: {
      top: InsightsArchetype[];
      primary_era?: string | null;
      primary_archetype?: string | null;
    };
  };
  insight?: {
    headline: string;
    subline: string;
    compact_tag: string;
  };
};

export async function fetchInsightsArchetypes(): Promise<InsightsPayload> {
  const data = await apiGet<{ ok?: boolean; payload?: unknown; insight?: InsightsPayload["insight"] }>(
    "/api/insights/archetypes"
  );
  return {
    payload: data?.payload as InsightsPayload["payload"] | undefined,
    insight: data?.insight,
  };
}
