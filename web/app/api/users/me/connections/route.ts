import { NextResponse } from "next/server";
import { supabaseRouteClient } from "@/lib/supabase/route-client";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function hasAny(table: string, userId: string) {
  const { data, error } = await supabaseServer
    .from(table)
    .select("updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (error) return { connected: false, last_sync: null as string | null };
  const row = data?.[0] as any;
  return { connected: !!row, last_sync: row?.updated_at ?? null };
}

const RUN_PLATFORM_KEYS: Record<string, string[]> = {
  psn: ["psn"],
  xbox: ["xbox"],
  steam: ["steam", "steam-thin", "steam_enrich", "steam-enrich"],
  ra: ["ra", "retroachievements"],
};

function getRunForPlatform(latestByPlatform: Map<string, any>, key: string): any {
  const candidates = RUN_PLATFORM_KEYS[key] ?? [key];
  let best: any = null;
  for (const c of candidates) {
    const r = latestByPlatform.get(c);
    if (r && (!best || new Date(r.started_at) > new Date(best.started_at))) best = r;
  }
  return best;
}

export async function GET() {
  const supabase = await supabaseRouteClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const [psn, xbox, steam, ra, runsData] = await Promise.all([
    hasAny("psn_title_progress", user.id),
    hasAny("xbox_title_progress", user.id),
    hasAny("steam_title_progress", user.id),
    hasAny("ra_achievement_cache", user.id),
    supabaseServer
      .from("sync_runs")
      .select("platform, status, started_at, duration_ms, error_message")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(50)
      .then(({ data: runs }) => {
        const latestByPlatform = new Map<string, any>();
        for (const r of runs ?? []) {
          if (!latestByPlatform.has(r.platform)) latestByPlatform.set(r.platform, r);
        }
        return latestByPlatform;
      }),
  ]);

  const base = [
    { key: "psn", label: "PlayStation Network", ...psn },
    { key: "xbox", label: "Xbox", ...xbox },
    { key: "steam", label: "Steam", ...steam },
    { key: "ra", label: "RetroAchievements", ...ra },
  ];

  const platforms = base.map((p) => {
    const run = getRunForPlatform(runsData, p.key);
    const status = p.connected ? "connected" : "disconnected";
    return {
      ...p,
      status,
      sync_status: run?.status ?? null,
      last_sync_run_at: run?.started_at ?? null,
      last_sync_duration_ms: run?.duration_ms ?? null,
      last_error_message: run?.error_message ?? null,
    };
  });

  // Most recent sync time across connected platforms (for "Last synced" display)
  const lastSyncedAt = platforms
    .filter((p) => p.connected)
    .map((p) => p.last_sync_run_at ?? p.last_sync ?? null)
    .filter(Boolean)
    .sort((a, b) => new Date(b!).getTime() - new Date(a!).getTime())[0] ?? null;

  return NextResponse.json({ ok: true, platforms, last_synced_at: lastSyncedAt });
}
