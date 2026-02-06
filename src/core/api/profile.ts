import { apiGet, apiPost } from "./client";

export type ProfileMe = {
  user_id: string;
  steam_id?: string | null;
  psn_online_id?: string | null;
  xbox_gamertag?: string | null;
  [key: string]: unknown;
};

export async function fetchProfileMe(): Promise<ProfileMe> {
  const data = await apiGet<ProfileMe>("/api/profile/me");
  return data;
}

export type SyncStatus = {
  steam_last_synced_at?: string | null;
  psn_last_synced_at?: string | null;
  xbox_last_synced_at?: string | null;
  [key: string]: unknown;
};

export async function fetchSyncStatus(): Promise<SyncStatus> {
  const data = await apiGet<ProfileMe & SyncStatus>("/api/profile/me");
  return data;
}

export async function triggerSyncSteam(): Promise<{ ok: boolean }> {
  return apiPost("/api/sync/steam-thin");
}

export async function triggerSyncPsn(): Promise<{ ok: boolean }> {
  return apiPost("/api/sync/psn");
}

export async function triggerSyncXbox(): Promise<{ ok: boolean }> {
  return apiPost("/api/sync/xbox");
}
