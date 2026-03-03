"use client";

type MostPlayedOn = {
  hardware_id: string;
  slug: string;
  display_name: string;
  is_modern_retro_handheld: boolean;
  total: number;
  manual: number;
  auto: number;
};

type PlayedOnAgg = {
  total_releases: number;
  handheld_share?: number; // 0..1
  by_kind?: Record<string, number>;
  top_device?: {
    slug?: string;
    display_name: string;
    kind?: string | null;
    era_key?: string | null;
    releases?: number;
    source?: string | null; // "manual" | "ra" | ...
  } | null;
  top_devices?: Array<{ display_name: string }>;
};

export function PlayedOnSummaryChip({
  mostPlayedOn,
  playedOn,
}: {
  mostPlayedOn?: MostPlayedOn | null;
  playedOn?: PlayedOnAgg | null;
}) {
  const name = mostPlayedOn?.display_name || playedOn?.top_device?.display_name;
  if (!name) return null;

  // Auto label: only when purely auto-assigned (manual: 0, auto > 0)
  // manual: 4, auto: 0 → no Auto | manual: 0, auto: 12 → show Auto
  const isAuto =
    !!mostPlayedOn &&
    (mostPlayedOn.manual ?? 0) === 0 &&
    (mostPlayedOn.auto ?? 0) > 0;

  const total = mostPlayedOn?.total ?? playedOn?.top_device?.releases ?? null;

  const handheldPct =
    typeof playedOn?.handheld_share === "number"
      ? Math.round(playedOn.handheld_share * 100)
      : null;

  const topDevices = playedOn?.top_devices ?? [];
  const also = topDevices.slice(1, 3).map((d) => d.display_name);

  return (
    <div className="flex flex-wrap gap-2">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
        <span className="text-xs text-white/60">Most played on:</span>
        <span className="text-xs font-semibold text-white">{name}</span>

        {typeof total === "number" && (
          <span className="text-[11px] text-white/45">· {total}</span>
        )}

        {isAuto && (
          <span className="text-[11px] rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-white/70">
            Auto
          </span>
        )}
      </div>

      {typeof handheldPct === "number" && (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
          <span className="text-xs text-white/60">Handheld share:</span>
          <span className="text-xs font-semibold text-white">{handheldPct}%</span>
        </div>
      )}

      {also.length > 0 && (
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
          <span className="text-xs text-white/60">Also:</span>
          <span className="text-xs font-semibold text-white">{also.join(", ")}</span>
        </div>
      )}
    </div>
  );
}
