export type PlayedOnTopDevice = {
  hardware_id: string;
  slug: string;
  display_name: string;
  kind: string | null;
  era_key: string | null;
  is_modern_retro_handheld: boolean;
  releases: number;
  manual: number;
  auto: number;
  // for convenience in UI
  source: "manual" | "auto";
};

export type PlayedOnSummary = {
  total_releases: number;
  top_device: {
    slug: string;
    display_name: string;
    kind: string | null;
    era_key: string | null;
    releases: number;
    source: "manual" | "auto";
  } | null;
  top_devices: PlayedOnTopDevice[];
  by_kind: Record<string, number>;
  handheld_share: number;
};

function isManualSource(source: string | null | undefined) {
  return source === "manual";
}

export async function getPlayedOnSummary(
  db: any, // supabase client
  userId: string,
  limitDevices = 3
): Promise<PlayedOnSummary> {
  const { data, error } = await db
    .from("user_release_played_on")
    .select(
      `
      source,
      hardware:hardware_id(
        id, slug, display_name, kind, era_key, is_modern_retro_handheld
      )
    `
    )
    .eq("user_id", userId)
    .eq("is_primary", true);

  if (error) throw error;

  const rows = (data ?? []).filter((r: any) => r?.hardware?.id);

  const total_releases = rows.length;

  const by_kind: Record<string, number> = {};
  const perDevice = new Map<string, PlayedOnTopDevice>();

  for (const r of rows) {
    const hw = r.hardware;
    const kind = (hw.kind ?? "other") as string;
    by_kind[kind] = (by_kind[kind] ?? 0) + 1;

    const cur =
      perDevice.get(hw.id) ??
      {
        hardware_id: hw.id,
        slug: hw.slug,
        display_name: hw.display_name,
        kind: hw.kind ?? null,
        era_key: hw.era_key ?? null,
        is_modern_retro_handheld: !!hw.is_modern_retro_handheld,
        releases: 0,
        manual: 0,
        auto: 0,
        source: "auto" as const,
      };

    cur.releases += 1;

    if (isManualSource(r.source)) cur.manual += 1;
    else cur.auto += 1;

    cur.source = cur.manual > 0 ? "manual" : "auto";

    perDevice.set(hw.id, cur);
  }

  const handheld = by_kind["handheld"] ?? 0;
  const handheld_share = total_releases > 0 ? handheld / total_releases : 0;

  const top_devices = [...perDevice.values()]
    .sort((a, b) => b.releases - a.releases)
    .slice(0, Math.max(1, Math.min(limitDevices, 10)));

  const top0 = top_devices[0] ?? null;

  return {
    total_releases,
    top_device: top0
      ? {
          slug: top0.slug,
          display_name: top0.display_name,
          kind: top0.kind,
          era_key: top0.era_key,
          releases: top0.releases,
          source: top0.source,
        }
      : null,
    top_devices,
    by_kind,
    handheld_share,
  };
}
