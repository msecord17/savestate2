import type {
  IdentitySummaryApiResponse,
  TimelineResponse,
} from "@/lib/identity/types";

export type { IdentitySummaryApiResponse, TimelineResponse };

const getBase = (): string => {
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_BASE_URL ?? "";
};

const IDENTITY_SUMMARY_TIMEOUT_MS = 12_000;

export type FetchIdentitySummaryResult = {
  data: IdentitySummaryApiResponse | null;
  /** Set when request failed so UI can show 401 vs 500. 0 = network/timeout/unknown. */
  errorStatus?: number;
  /** True when the request was aborted due to timeout (so UI can show "timed out"). */
  timedOut?: boolean;
};

export async function fetchIdentitySummary(): Promise<FetchIdentitySummaryResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IDENTITY_SUMMARY_TIMEOUT_MS);
  try {
    const base = getBase();
    const res = await fetch(`${base}/api/identity/summary`, {
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { data: null, errorStatus: res.status };
    }
    return { data: (data ?? null) as IdentitySummaryApiResponse | null };
  } catch (e) {
    clearTimeout(timeoutId);
    const isAbort = e instanceof Error && e.name === "AbortError";
    return {
      data: null,
      errorStatus: 0,
      ...(isAbort ? { timedOut: true as const } : {}),
    };
  }
}

export async function fetchTimeline(
  mode: "release_year" | "played_on_gen" = "release_year",
  sort: "dominance" | "chronological" = "dominance"
): Promise<TimelineResponse | null> {
  try {
    const params = new URLSearchParams({ mode });
    if (sort !== "dominance") params.set("sort", sort);
    params.set("t", String(Date.now())); // cache killer: confirm API returns platform_gen
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
