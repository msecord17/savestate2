"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageShell } from "@/src/ui/PageShell";
import { IdentityStrip } from "@/app/components/identity/IdentityStrip";
import { EraTimeline } from "@/components/identity/EraTimeline";
import { EraDetailDrawer } from "@/app/components/identity/EraDetailDrawer";
import { ArchetypeDrawer } from "@/app/components/identity/ArchetypeDrawer";
import { eraLabel, eraYears, toEraKey } from "@/lib/identity/eras";
import { buildEraSnapshot } from "@/lib/identity/eraSnapshot";
import { getEraMeta, ERA_META } from "@/lib/eras";
import { releaseHref } from "@/lib/routes";
import { buildVm } from "@/lib/profile/buildVm";
import { buildChips } from "@/lib/profile/buildChips";
import type { PublicProfilePayload } from "@/lib/public-profile";
import { ShareCardPreview } from "@/app/components/identity/ShareCardPreview";
import { PlayedOnSummaryChip } from "@/components/identity/PlayedOnSummaryChip";

function normalizeCover(url: string | null): string {
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url;
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function PublicProfilePageClient({ username }: { username: string }) {
  const [data, setData] = useState<PublicProfilePayload | null>(null);
  const [privateProfile, setPrivateProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [eraFilter, setEraFilter] = useState<string | null>(null);
  const [eraDrawerOpen, setEraDrawerOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!username) {
      setError("Missing username");
      return;
    }
    let cancelled = false;
    fetch(`/api/public/profile/${encodeURIComponent(username)}`)
      .then((res) => res.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.private === true) {
          setPrivateProfile(true);
          setData(null);
          return;
        }
        if (body?.error) {
          setError(body.error === "Not found" ? "Not found" : body.error);
          setData(null);
          return;
        }
        if (body?.ok === true && body?.user) {
          setPrivateProfile(false);
          setError(null);
          setData({ ...body, isOwner: !!body?.isOwner });
          return;
        }
        setError("Not found");
        setData(null);
      })
      .catch(() => {
        if (!cancelled) setError("Not found");
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  const handleCopyLink = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (username && !data && !error && !privateProfile) {
    return (
      <PageShell className="flex min-h-screen items-center justify-center">
        <p className="text-[var(--muted)]">Loading…</p>
      </PageShell>
    );
  }

  if (privateProfile) {
    return (
      <PageShell className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-[var(--text)]">This profile is private.</p>
        <Link href="/" className="text-sm text-[var(--accent)] hover:underline">
          Go home
        </Link>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-[var(--text)]">Profile not found.</p>
        <Link href="/" className="text-sm text-[var(--accent)] hover:underline">
          Go home
        </Link>
      </PageShell>
    );
  }

  const vm = buildVm(data);
  const playedOnByEra = (data as any).played_on_by_era ?? {};
  const chips = buildChips(vm);

  const eraRows = vm.eras.map((e) => ({
    era: e.key,
    label: e.meta.title,
    years: e.meta.sub,
    order: e.meta.order,
    games: e.stats?.games ?? 0,
    releases: e.stats?.releases ?? 0,
  }));

  const totalKnownReleases = eraRows.reduce((sum, r) => sum + r.releases, 0) || 1;

  const unknownRow = vm.timeline.stats?.["unknown"]
    ? {
        era: "unknown" as const,
        ...ERA_META.unknown,
        games: vm.timeline.stats.unknown.games ?? 0,
        releases: vm.timeline.stats.unknown.releases ?? 0,
      }
    : null;

  const notableGamesForDrawer =
    eraFilter
      ? (vm.eras.find((e) => e.key === eraFilter)?.standouts ?? []).map((n) => ({
          title: n.title ?? "Untitled",
          platform: null,
          played_on: n.played_on ?? null,
          earned: n.earned != null ? n.earned : undefined,
          total: n.total != null ? n.total : undefined,
          minutes_played: n.minutes_played != null ? n.minutes_played : undefined,
        }))
      : [];

  const stats = vm.timeline.stats ?? {};
  const selKey = eraFilter ? toEraKey(eraFilter) : null;
  const eraStats = selKey ? stats[selKey] : null;
  const eraPlayedOn = selKey ? (data as any).played_on_by_era?.[selKey] : null;

  const totals = Object.values(stats).reduce(
    (acc, s) => {
      acc.games += s?.games ?? 0;
      acc.releases += s?.releases ?? 0;
      return acc;
    },
    { games: 0, releases: 0 }
  );

  const eraProfile = eraStats
    ? {
        owned_games: eraStats.games ?? 0,
        owned_releases: eraStats.releases ?? 0,
        share_pct: (eraStats.releases ?? 0) / Math.max(1, totals.releases),
        most_played_on: eraPlayedOn?.top_device
          ? {
              name: eraPlayedOn.top_device.display_name,
              source: eraPlayedOn.top_device.source,
              also: (eraPlayedOn.top_devices ?? []).slice(1, 3).map((d: any) => d.display_name),
            }
          : null,
      }
    : null;

  const archetypeSnapshot = eraFilter
    ? buildEraSnapshot({
        seed: vm.user?.username ?? "public",
        eraKey: eraFilter,
        eraLabel: eraLabel(eraFilter),
        eraYears: eraYears(eraFilter),
        archetypeName: vm.primaryArchetype?.label ?? null,
        ownedGames: eraProfile?.owned_games ?? null,
        ownedReleases: eraProfile?.owned_releases ?? null,
        sharePct: eraProfile?.share_pct ?? null,
        notableGames: notableGamesForDrawer,
        eraMostPlayedOnName: eraPlayedOn?.top_device?.display_name ?? null,
        eraMostPlayedOnSource: eraPlayedOn?.top_device?.source ?? null,
      })
    : "";

  return (
    <PageShell maxWidth={560} padding={24}>
        {/* Hero */}
        <header className="mb-6">
          <div className="flex items-center gap-4">
            {vm.user.avatar_url ? (
              <img
                src={normalizeCover(vm.user.avatar_url)}
                alt=""
                className="h-16 w-16 rounded-full object-cover border border-white/10"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold text-white/70">
                {vm.user.display_name?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-semibold text-white truncate">
                {vm.user.display_name}
              </h1>
              <p className="text-sm text-white/60 truncate">@{vm.user.username}</p>
              {vm.user.discord_handle != null && vm.user.discord_handle !== "" && (
                <p className="flex items-center gap-1.5 mt-1 text-xs text-white/50">
                  <DiscordIcon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>{vm.user.discord_handle}</span>
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {data?.isOwner && (
              <Link
                href="/settings"
                className="px-4 py-2 rounded-lg border border-white/20 bg-white/5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
              >
                Settings
              </Link>
            )}
            <button
              type="button"
              onClick={handleCopyLink}
              className="px-4 py-2 rounded-lg border border-white/20 bg-white/5 text-sm font-medium text-white hover:bg-white/10 transition-colors"
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            <Link
              href={`/users/${encodeURIComponent(vm.user.username)}/card`}
              className="px-4 py-2 rounded-lg bg-sky-600 text-sm font-medium text-white hover:bg-sky-500 transition-colors"
            >
              Share identity card
            </Link>
          </div>
        </header>

        {/* Identity Strip */}
        <IdentityStrip
          chips={chips}
          onOpenDrawer={(chip) => {
            if (chip?.kind === "era" && chip?.eraKey) {
              setEraFilter(chip.eraKey);
              setEraDrawerOpen(true);
              return;
            }
            setDrawerOpen(true);
          }}
        />

        {(vm.mostPlayedOn || vm.playedOn) && (
          <div className="mt-2">
            <PlayedOnSummaryChip playedOn={vm.playedOn} mostPlayedOn={vm.mostPlayedOn} />
          </div>
        )}

        {/* Era cards */}
        <div className="px-0 mt-4">
          <EraTimeline
            eras={vm.eras}
            selectedEra={eraFilter}
            onSelectEra={(key) => {
              setEraFilter(key);
              setEraDrawerOpen(true);
            }}
            playedOnByEra={playedOnByEra}
          />
        </div>

        {/* Lifetime Score */}
        <section className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <div className="text-xs text-white/50 uppercase tracking-wider">Lifetime Score</div>
          <div className="mt-1 text-3xl font-semibold text-white">
            {vm.lifetimeScore ?? "—"}
          </div>
          <p className="mt-2 text-xs text-white/50">Titles played · Achievements · Hours</p>
        </section>

        {/* Era breakdown (normalized to timeline eras) */}
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="font-semibold text-white mb-2">Era breakdown</div>
          <p className="text-sm text-white/60 mb-3">
            Same era keys as the timeline (gen3…gen9). Ranked by chronological era.
          </p>

          <div className="flex flex-col gap-3">
            {eraRows.map((r) => {
              const share = r.releases / totalKnownReleases;
              return (
                <div key={r.era} className="flex flex-col gap-1.5">
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {r.label}{" "}
                        <span className="font-medium text-white/60">
                          {r.years ? `(${r.years})` : ""}
                        </span>
                      </div>
                      <div className="text-xs text-white/60 mt-0.5">
                        {r.games} games • {r.releases} releases
                      </div>
                    </div>

                    <div className="text-xs text-white/60 whitespace-nowrap">
                      {Math.round(share * 100)}%
                    </div>
                  </div>

                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-white/40 transition-all"
                      style={{ width: `${Math.max(2, Math.round(share * 100))}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {unknownRow && (unknownRow.games > 0 || unknownRow.releases > 0) && (
              <div className="mt-2 text-xs text-amber-400/90">
                {unknownRow.games} games still have unknown era (missing year data).
              </div>
            )}
          </div>
        </div>

        {/* Notable games (recent) */}
        {vm.notableGames.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">
              Recent activity
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {vm.notableGames.map((r) => (
                <Link
                  key={r.release_id}
                  href={releaseHref(r.release_id)}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-2 hover:bg-white/[0.08] transition-colors"
                >
                  {r.cover_url ? (
                    <img
                      src={normalizeCover(r.cover_url)}
                      alt=""
                      className="h-12 w-12 rounded object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded bg-white/10 flex-shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white truncate" title={r.title}>
                      {r.title}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Share card preview */}
        <ShareCardPreview vm={vm} className="mt-6" />

        <ArchetypeDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          detail={vm.drawerDetail}
          primaryEra={vm.topEraKey && getEraMeta(vm.topEraKey).key !== "unknown" ? vm.topEraKey : undefined}
        />

        <EraDetailDrawer
          open={eraDrawerOpen}
          onOpenChange={setEraDrawerOpen}
          eraKey={eraFilter}
          eraLabel={eraFilter ? eraLabel(eraFilter) : ""}
          eraYears={eraFilter ? eraYears(eraFilter) : "—"}
          interpretation={selKey ? "This era is part of your story." : ""}
          notableGames={notableGamesForDrawer}
          eraProfile={eraProfile}
          archetypeSnapshot={archetypeSnapshot}
          primaryArchetypeKey={vm.primaryArchetype?.key ?? undefined}
        />

        <div className="mt-6 text-center text-xs text-[var(--muted)]">
          Public profile · SaveState
        </div>
    </PageShell>
  );
}
