import { apiGet } from "./client";
import type {
  IdentitySummaryApiResponse,
  TimelineResponse,
} from "@/lib/identity/types";

export type { IdentitySummaryApiResponse, TimelineResponse };

export async function fetchIdentitySummary(): Promise<IdentitySummaryApiResponse | null> {
  try {
    const data = await apiGet<IdentitySummaryApiResponse>("/api/identity/summary", {
      credentials: "include",
    });
    return data ?? null;
  } catch {
    return null;
  }
}

export async function fetchTimeline(
  mode: "release_year" | "played_on_gen" = "release_year",
  sort: "dominance" | "chronological" = "dominance"
): Promise<TimelineResponse | null> {
  try {
    const params = new URLSearchParams({ mode });
    if (sort !== "dominance") params.set("sort", sort);
    const data = await apiGet<TimelineResponse>(
      `/api/identity/timeline?${params.toString()}`,
      { credentials: "include" }
    );
    if (data && data.ok === true) return data;
    return null;
  } catch {
    return null;
  }
}
