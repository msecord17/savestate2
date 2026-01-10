import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/route";

type ReleaseCard = {
  entry_id: string;
  release_id: string;
  status: string;
  playtime_minutes: number;
  last_played_at: string | null;
  updated_at: string;
  releases: {
    id: string;
    display_title: string;
    platform_name: string;
    platform_key: string | null;
    cover_url: string | null;
    games: {
      igdb_game_id: number | null;
      summary: string | null;
      genres: string[] | null;
      developer: string | null;
      publisher: string | null;
      first_release_year: number | null;
    } | null;
  } | null;
};

function takeUniqueByRelease(rows: ReleaseCard[], n: number) {
  const seen = new Set<string>();
  const out: ReleaseCard[] = [];
  for (const r of rows) {
    const id = r.releases?.id || r.release_id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(r);
    if (out.length >= n) break;
  }
  return out;
}

export async function GET() {
  const supabase = await supabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  // Pull portfolio + release info once, then slice into sections.
  const { data: entries, error } = await supabase
    .from("portfolio_entries")
    .select(
      `
      id,
      release_id,
      status,
      playtime_minutes,
      last_played_at,
      updated_at,
      releases (
        id,
        display_title,
        platform_name,
        platform_key,
        cover_url,
        games (
          igdb_game_id,
          summary,
          genres,
          developer,
          publisher,
          first_release_year
        )
      )
    `
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const raw = Array.isArray(entries) ? entries : [];

  const rows = raw.map((r: any) => ({
    entry_id: r.id,
    release_id: r.release_id,
    status: r.status,
    playtime_minutes: r.playtime_minutes ?? 0,
    last_played_at: r.last_played_at ?? null,
    updated_at: r.updated_at,
    releases: r.releases ?? null,
  })) as ReleaseCard[];

  const PLATFORM_LABELS: Record<string, string> = {
    snes: "Super Nintendo",
    nes: "Nintendo (NES)",
    genesis: "Sega Genesis",
    ps1: "PlayStation",
    n64: "Nintendo 64",
    gba: "Game Boy Advance",
    gbc: "Game Boy Color",
    gb: "Game Boy",
    dreamcast: "Dreamcast",
    saturn: "Saturn",
    arcade: "Arcade",
    steam: "Steam",
  };

  // Sorting helpers
  const byLastPlayedDesc = [...rows].sort((a, b) => {
    const ta = a.last_played_at ? new Date(a.last_played_at).getTime() : 0;
    const tb = b.last_played_at ? new Date(b.last_played_at).getTime() : 0;
    return tb - ta;
  });

  const byUpdatedDesc = [...rows].sort((a, b) => {
    const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return tb - ta;
  });

  const byPlaytimeDesc = [...rows].sort(
    (a, b) => (b.playtime_minutes ?? 0) - (a.playtime_minutes ?? 0)
  );

  const playing = takeUniqueByRelease(
    byLastPlayedDesc.filter((r) => r.status === "playing"),
    10
  );

  const recentlyPlayed = takeUniqueByRelease(
    byLastPlayedDesc.filter((r) => !!r.last_played_at),
    10
  );

  const wishlist = takeUniqueByRelease(
    byUpdatedDesc.filter((r) => r.status === "wishlist"),
    10
  );

  const backBurner = takeUniqueByRelease(
    byUpdatedDesc.filter((r) => r.status === "back_burner"),
    10
  );

  const recentlyAdded = takeUniqueByRelease(byUpdatedDesc, 10);

  // Curated from your library: platform diversity
  const curated = takeUniqueByRelease(
    [...rows]
      .filter((r) => r.releases?.platform_key)
      .sort((a, b) =>
        (a.releases!.platform_key! > b.releases!.platform_key! ? 1 : -1)
      ),
    10
  );

  const neglected = takeUniqueByRelease(
    [...rows]
      .filter(
        (r) =>
          r.status === "owned" ||
          r.status === "wishlist" ||
          r.status === "back_burner"
      )
      .sort((a, b) => {
        // Prefer never-played first
        const pa = a.last_played_at ? 1 : 0;
        const pb = b.last_played_at ? 1 : 0;
        if (pa !== pb) return pa - pb;

        // Then oldest played first
        const ta = a.last_played_at ? new Date(a.last_played_at).getTime() : 0;
        const tb = b.last_played_at ? new Date(b.last_played_at).getTime() : 0;
        return ta - tb;
      }),
    10
  );

  const topPlayed = takeUniqueByRelease(
    byPlaytimeDesc.filter((r) => (r.playtime_minutes ?? 0) > 0),
    10
  );

  // Platform rotation: choose least represented platform and show 10 games from it
  const platformCounts = new Map<string, number>();
  for (const r of rows) {
    const k = r.releases?.platform_key;
    if (!k) continue;
    platformCounts.set(k, (platformCounts.get(k) ?? 0) + 1);
  }

  const rarePlatformKey =
    [...platformCounts.entries()].sort((a, b) => a[1] - b[1])[0]?.[0] ?? null;

  const platformRotation = rarePlatformKey
    ? takeUniqueByRelease(
        rows.filter((r) => r.releases?.platform_key === rarePlatformKey),
        10
      )
    : [];

  const sections = [
    { key: "continue", title: "Continue Playing", items: playing },
    { key: "recent", title: "Recently Played", items: recentlyPlayed },
    { key: "neglected", title: "Neglected Gems", items: neglected },

    ...(platformRotation.length
      ? [
          {
            key: "rotation",
            title: `Platform Rotation: ${
              PLATFORM_LABELS[rarePlatformKey] ?? rarePlatformKey
            }`,
            items: platformRotation,
          },
        ]
      : []),

    { key: "topplayed", title: "Top Played", items: topPlayed },
    { key: "wishlist", title: "Wishlist Picks", items: wishlist },
    { key: "backburner", title: "Back Burner", items: backBurner },
    { key: "added", title: "Recently Added", items: recentlyAdded },
    { key: "curated", title: "Curated from your library", items: curated },
  ].filter((s) => (s.items?.length ?? 0) > 0);

  return NextResponse.json({ sections });
}
