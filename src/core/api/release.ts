import { apiGet } from "./client";

export type ReleaseDetail = {
  id: string;
  game_id: string | null;
  display_title: string;
  platform_key: string | null;
  platform_name: string | null;
  platform_label: string | null;
  cover_url: string | null;
  [key: string]: unknown;
};

export async function fetchRelease(releaseId: string): Promise<ReleaseDetail> {
  const data = await apiGet<ReleaseDetail>(`/api/releases/${releaseId}`);
  return data;
}

export async function fetchReleaseAchievements(releaseId: string): Promise<unknown> {
  const data = await apiGet<unknown>(`/api/releases/${releaseId}/achievements`);
  return data;
}
