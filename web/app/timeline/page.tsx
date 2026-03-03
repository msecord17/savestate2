"use client";

import { useEffect, useState } from "react";
import { fetchTimeline } from "@/src/core/api/identity";
import type { EraTimelineItem, TimelineResponse } from "@/lib/identity/types";
import { EraDetailDrawer } from "@/app/components/identity/EraDetailDrawer";
import { TimelineView } from "@/components/identity/TimelineView";
import { eraLabel, eraYears, toEraKey } from "@/lib/identity/eras";
import { buildEraSnapshot } from "@/lib/identity/eraSnapshot";

/** One sentence per era for the drawer (no raw counts). Canonical genX keys only; legacy keys normalized via toEraKey. */
const INTERPRETATION: Record<string, string> = {
  gen1_1972_1977: "This era holds a special place in your library.",
  gen2_1978_1982: "Your collection has a strong foothold in the Atari 2600 era.",
  gen3_1983_1989: "The NES era is well represented in your library.",
  gen4_1990_1995: "The 16-bit era is well represented in your library.",
  gen5_1996_1999: "The PlayStation / N64 / Saturn era holds a strong place in your library.",
  gen6_2000_2005: "The PS2 / OG Xbox / GC era is a cornerstone of your collection.",
  gen7_2006_2012: "Your library spans the HD era with breadth.",
  gen8_2013_2019: "The PS4 / Xbox One / Switch era is well represented.",
  gen9_2020_plus: "Your library leans into the modern era.",
  unknown: "This era rounds out your collection.",
  // Legacy fallbacks
  gen2_1976_1984: "Your collection has a strong foothold in the 8-bit cartridge era.",
  gen3_1983_1992: "The NES era is well represented in your library.",
  gen4_1987_1996: "The 16-bit era is well represented in your library.",
  gen5a_1993_1996: "You've built a notable slice of the 32-bit dawn.",
  gen5b_1996_2001: "The N64 / 64-bit wave holds a strong place in your library.",
  gen6_1998_2005: "The PS2 / OG Xbox / GC era is a cornerstone of your collection.",
  gen7_2005_2012: "Your library spans the HD era with breadth.",
};

const DEFAULT_CHIPS: [string, string, string] = ["Library depth", "Era focus", "Multi-platform"];

type PlayedOnEraRecord = Record<
  string,
  {
    total_releases: number;
    handheld_share: number;
    top_device: { display_name: string; releases?: number; source?: "manual" | "auto" } | null;
    top_devices?: { display_name: string; releases: number; source: "manual" | "auto" }[];
  }
>;

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
  const [playedOnByEra, setPlayedOnByEra] = useState<PlayedOnEraRecord>({});

  useEffect(() => {
    fetch("/api/identity/summary")
      .then((r) => r.json())
      .then((j) => setPlayedOnByEra((j?.played_on_by_era ?? {}) as PlayedOnEraRecord))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchTimeline(mode, sort).then((res) => {
      setData(res ?? null);
      setLoading(false);
    });
  }, [mode, sort]);

  const [drawerSection, setDrawerSection] = useState<"standouts" | "played_on" | "profile">("profile");

  const openDrawer = (era: EraTimelineItem, section?: "standouts" | "played_on" | "profile") => {
    setSelectedEra(era);
    setDrawerSection(section ?? "profile");
    setDrawerOpen(true);
  };

  const totalKnownReleases =
    (data?.eras ?? []).reduce((sum, e) => sum + (e.releases ?? 0), 0) || 1;

  const eraProfile = selectedEra
    ? {
        owned_games: selectedEra.games,
        owned_releases: selectedEra.releases,
        share_pct: (selectedEra.releases ?? 0) / totalKnownReleases,
      }
    : null;

  const notableGamesForDrawer =
    selectedEra?.notable?.map((n) => ({
      title: n.title,
      platform: null,
      played_on: n.played_on ?? null,
      earned: n.earned != null ? n.earned : undefined,
      total: n.total != null ? n.total : undefined,
      minutes_played: n.minutes_played != null ? n.minutes_played : undefined,
    })) ?? [];

  const archetypeSnapshot =
    selectedEra
      ? buildEraSnapshot({
          seed: data?.user_id ?? "timeline",
          eraKey: selectedEra.era,
          eraLabel: eraLabel(selectedEra.era),
          eraYears: eraYears(selectedEra.era),
          archetypeName: null,
          ownedGames: eraProfile?.owned_games ?? null,
          ownedReleases: eraProfile?.owned_releases ?? null,
          sharePct: eraProfile?.share_pct ?? null,
          notableGames: notableGamesForDrawer,
        })
      : "";

  const eraKey = selectedEra?.era ?? null;
  const eraPlayedOn = eraKey ? playedOnByEra[toEraKey(eraKey)] ?? null : null;

  return (
    <div className="min-h-screen">
      <TimelineView
        data={data}
        loading={loading}
        mode={mode}
        onModeChange={setMode}
        sort={sort}
        onSortChange={setSort}
        onSelectEra={openDrawer}
        playedOnByEra={playedOnByEra}
      />

      <EraDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        eraKey={selectedEra?.era ?? null}
        eraLabel={selectedEra ? eraLabel(selectedEra.era) : ""}
        eraYears={selectedEra ? eraYears(selectedEra.era) : "—"}
        interpretation={selectedEra ? INTERPRETATION[toEraKey(selectedEra.era)] ?? "This era is part of your library." : ""}
        signalChips={selectedEra ? toSignalChips(selectedEra.topSignals) : DEFAULT_CHIPS}
        notableGames={notableGamesForDrawer}
        eraProfile={eraProfile}
        archetypeSnapshot={archetypeSnapshot}
        primaryArchetypeKey={null}
        initialSection={drawerSection}
        eraPlayedOn={eraPlayedOn}
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
