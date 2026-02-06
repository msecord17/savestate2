"use client";

import { useEffect, useState } from "react";
import { fetchTimeline } from "@/src/core/api/identity";
import type { EraTimelineItem, TimelineResponse } from "@/lib/identity/types";
import { EraDetailDrawer } from "@/app/components/identity/EraDetailDrawer";
import { TimelineView } from "@/components/identity/TimelineView";

/** One sentence per era for the drawer (no raw counts). Release-year and played-on keys. */
const INTERPRETATION: Record<string, string> = {
  early_arcade_pre_crash: "This era holds a special place in your library.",
  "8bit_home": "Your collection has a strong foothold in the 8-bit era.",
  "16bit": "The 16-bit era is well represented in your library.",
  "32_64bit": "You've built a notable slice of the PS1/N64 era.",
  ps2_xbox_gc: "The PS2 era holds a strong place in your library.",
  hd_era: "Your library spans the HD era with breadth.",
  ps4_xbo: "The PS4 era is a cornerstone of your collection.",
  switch_wave: "The Switch wave is well represented in your library.",
  modern: "Your library leans into the modern era.",
  unknown: "This era rounds out your collection.",
  early_retro: "You've played on early and retro hardware.",
  ps2_ogxbox_gc: "This hardware generation shaped your play.",
  ps3_360_wii: "The PS3/360/Wii generation is well represented in how you play.",
  ps4_xbox_one_switch: "You play a lot on this generation of consoles.",
  pc: "PC is a major part of how you play.",
  xbox_hd: "Xbox (HD/Modern) is part of your play history.",
  unknown_played_on: "This bucket rounds out your played-on history.",
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
        eraLabel={selectedEra?.label ?? ""}
        eraYears={selectedEra?.years ?? "—"}
        interpretation={selectedEra ? INTERPRETATION[selectedEra.era] ?? "This era is part of your library." : ""}
        signalChips={selectedEra ? toSignalChips(selectedEra.topSignals) : DEFAULT_CHIPS}
        notableGames={
          selectedEra?.notable?.map((n) => ({
            title: n.title,
            platform: null,
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
