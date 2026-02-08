"use client";

import { useEffect, useState } from "react";
import { fetchTimeline } from "@/src/core/api/identity";
import type { EraTimelineItem, TimelineResponse } from "@/lib/identity/types";
import { EraDetailDrawer } from "@/app/components/identity/EraDetailDrawer";
import { TimelineView } from "@/components/identity/TimelineView";
import { eraLabel, eraYears, toEraKey } from "@/lib/identity/eras";

/** One sentence per era for the drawer (no raw counts). Canonical genX keys only; legacy keys normalized via toEraKey. */
const INTERPRETATION: Record<string, string> = {
  gen1_1972_1977: "This era holds a special place in your library.",
  gen2_1976_1984: "Your collection has a strong foothold in the 8-bit cartridge era.",
  gen3_1983_1992: "The NES era is well represented in your library.",
  gen4_1987_1996: "The 16-bit era is well represented in your library.",
  gen5a_1993_1996: "You've built a notable slice of the 32-bit dawn.",
  gen5b_1996_2001: "The N64 / 64-bit wave holds a strong place in your library.",
  gen6_1998_2005: "The PS2 / OG Xbox / GC era is a cornerstone of your collection.",
  gen7_2005_2012: "Your library spans the HD era with breadth.",
  gen8_2013_2019: "The PS4 / Xbox One / Switch era is well represented.",
  gen9_2020_plus: "Your library leans into the modern era.",
  unknown: "This era rounds out your collection.",
};

const DEFAULT_CHIPS: [string, string, string] = ["Library depth", "Era focus", "Multi-platform"];

function toSignalChips(topSignals: Array<{ key: string; label: string }>): [string, string, string] {
  const labels = topSignals.map((s) => s.label);
  return [
    labels[0] ?? DEFAULT_CHIPS[0],
    labels[1] ?? DEFAULT_CHIPS[1],
    labels[2] ?? DEFAULT_CHIPS[2],
  ];
}

export default function TimelinePage() {
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"release_year" | "played_on_gen">("release_year");
  const [sort, setSort] = useState<"dominance" | "chronological">("dominance");
  const [selectedEra, setSelectedEra] = useState<EraTimelineItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchTimeline(mode, sort).then((res) => {
      setData(res ?? null);
      setLoading(false);
    });
  }, [mode, sort]);

  const openDrawer = (era: EraTimelineItem) => {
    setSelectedEra(era);
    setDrawerOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950">
      <TimelineView
        data={data}
        loading={loading}
        mode={mode}
        onModeChange={setMode}
        sort={sort}
        onSortChange={setSort}
        onSelectEra={openDrawer}
      />

      <EraDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        eraKey={selectedEra?.era ?? null}
        eraLabel={selectedEra ? eraLabel(selectedEra.era) : ""}
        eraYears={selectedEra ? eraYears(selectedEra.era) : "—"}
        interpretation={selectedEra ? INTERPRETATION[toEraKey(selectedEra.era)] ?? "This era is part of your library." : ""}
        signalChips={selectedEra ? toSignalChips(selectedEra.topSignals) : DEFAULT_CHIPS}
        notableGames={
          selectedEra?.notable?.map((n) => ({
            title: n.title,
            platform: null,
            played_on: n.played_on ?? null,
            earned: n.earned,
            total: n.total,
            minutes_played: n.minutes_played,
          })) ?? []
        }
        archetypeSnapshot="Your profile in this era will appear as you connect platforms and add games."
        primaryArchetypeKey={null}
        achievementsClarification={
          selectedEra?.titles_with_achievements != null &&
          selectedEra.titles_with_achievements > 0 &&
          selectedEra.titles_with_achievements < 3
            ? `Based on ${selectedEra.titles_with_achievements} title${selectedEra.titles_with_achievements === 1 ? "" : "s"} with achievements.`
            : null
        }
      />
    </div>
  );
}
