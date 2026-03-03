import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncPlatform = "psn" | "xbox" | "steam" | "ra";

export async function recordSyncStart(
  supabase: SupabaseClient,
  userId: string,
  platform: SyncPlatform
): Promise<string | null> {
  const { data, error } = await supabase
    .from("sync_runs")
    .insert({
      user_id: userId,
      platform,
      status: "syncing",
    })
    .select("id")
    .single();

  if (error) return null;
  return data?.id ?? null;
}

export async function recordSyncEnd(
  supabase: SupabaseClient,
  runId: string | null,
  status: "ok" | "error",
  opts?: { durationMs?: number; errorMessage?: string; resultJson?: unknown }
): Promise<void> {
  if (!runId) return;

  const finishedAt = new Date().toISOString();
  await supabase
    .from("sync_runs")
    .update({
      status,
      finished_at: finishedAt,
      duration_ms: opts?.durationMs ?? null,
      error_message: opts?.errorMessage ?? null,
      result_json: opts?.resultJson ?? null,
    })
    .eq("id", runId);
}
