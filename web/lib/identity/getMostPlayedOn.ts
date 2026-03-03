export type MostPlayedOn = {
  hardware_id: string;
  slug: string;
  display_name: string;
  is_modern_retro_handheld: boolean;
  total: number;
  manual: number;
  auto: number; // ra, etc.
};

export async function getMostPlayedOn(
  db: any, // supabase client
  userId: string,
  minCount = 3
): Promise<MostPlayedOn | null> {
  const { data, error } = await db
    .from("user_release_played_on")
    .select("source, hardware:hardware_id(id, slug, display_name, is_modern_retro_handheld)")
    .eq("user_id", userId);

  if (error) throw error;
  if (!data?.length) return null;

  const counts = new Map<string, MostPlayedOn>();

  for (const row of data) {
    const hw = row.hardware;
    if (!hw?.id) continue;

    const cur =
      counts.get(hw.id) ??
      {
        hardware_id: hw.id,
        slug: hw.slug,
        display_name: hw.display_name,
        is_modern_retro_handheld: !!hw.is_modern_retro_handheld,
        total: 0,
        manual: 0,
        auto: 0,
      };

    cur.total += 1;
    if (row.source === "manual") cur.manual += 1;
    else cur.auto += 1;

    counts.set(hw.id, cur);
  }

  const best = [...counts.values()].sort((a, b) => b.total - a.total)[0];
  if (!best || best.total < minCount) return null;

  return best;
}
