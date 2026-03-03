"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PageShell } from "@/src/ui/PageShell";
import { EraDetailDrawer } from "@/app/components/identity/EraDetailDrawer";
import { ArchetypeDrawer } from "@/app/components/identity/ArchetypeDrawer";
import { eraLabel, eraYears, toEraKey } from "@/lib/identity/eras";
import { buildEraSnapshot } from "@/lib/identity/eraSnapshot";
import { getEraMeta, ERA_META } from "@/lib/eras";
import { releaseHref } from "@/lib/routes";
import { buildVm } from "@/lib/profile/buildVm";
import { buildChips } from "@/lib/profile/buildChips";
import type { PublicProfilePayload } from "@/lib/public-profile";
import { ChevronRight } from "lucide-react";

// Profile style kit
const goldBtn =
  "inline-flex items-center justify-center h-12 px-7 rounded-[var(--radius-xl)] bg-[#F2C14E] text-black font-semibold hover:bg-[#F2C14E]/90 active:scale-[0.99] transition";

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card/60 backdrop-blur",
        "shadow-[0_20px_80px_rgba(0,0,0,0.45)]",
        "before:absolute before:inset-0 before:pointer-events-none before:content-['']",
        "before:bg-[linear-gradient(to_bottom,rgba(255,255,255,0.06),transparent_40%)]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{children}</div>;
}

function CollectionSummary() {
  const [data, setData] = useState<{
    digital_owned: number;
    physical_owned: number;
    platforms_played: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users/me/collection-summary", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.ok) setData(j);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const digital = data?.digital_owned ?? null;
  const physical = data?.physical_owned ?? null;
  const platforms = data?.platforms_played ?? null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <GlassCard className="p-5">
        <div className="text-xs text-white/60">DIGITAL OWNED</div>
        <div className="mt-2 text-4xl font-semibold text-white">{digital ?? "—"}</div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="text-xs text-white/60">PHYSICAL OWNED</div>
        <div className="mt-2 text-4xl font-semibold text-white">{physical ?? "—"}</div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="text-xs text-white/60">PLATFORMS PLAYED</div>
        <div className="mt-2 text-4xl font-semibold text-white">{platforms ?? "—"}</div>
      </GlassCard>
    </div>
  );
}

function fmtInt(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString();
}

function normalizeCover(url: string | null): string {
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url;
}

export default function UsersProfilePageClient() {
  const params = useParams();
  const username = (params?.username as string)?.trim() ?? "";

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
        <Link href="/gamehome" className="text-sm text-[var(--accent)] hover:underline">
          Go home
        </Link>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-[var(--text)]">Profile not found.</p>
        <Link href="/gamehome" className="text-sm text-[var(--accent)] hover:underline">
          Go home
        </Link>
      </PageShell>
    );
  }

  const vm = buildVm(data);
  const playedOnByEra = (data as any).played_on_by_era ?? {};
  const chips = buildChips(vm);
  const identity = (data as any).identity as Record<string, unknown> | null | undefined;
  const totals = (identity?.totals ?? {}) as {
    owned_games?: number;
    owned_releases?: number;
    minutes_played?: number;
    achievements_earned?: number;
    achievements_total?: number;
  };
  const topSignals = (identity?.top_signals ?? []) as Array<{ key: string; label: string }>;

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

  const totalsObj = Object.values(stats).reduce(
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
        share_pct: (eraStats.releases ?? 0) / Math.max(1, totalsObj.releases),
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

  const topEraMeta = vm.topEraKey ? getEraMeta(vm.topEraKey) : null;
  const hoursPlayed = totals.minutes_played != null ? Math.round(totals.minutes_played / 60) : 0;
  const completionRate =
    totals.achievements_total != null && totals.achievements_total > 0 && totals.achievements_earned != null
      ? Math.round((totals.achievements_earned / totals.achievements_total) * 100)
      : null;

  return (
    <PageShell>
      <div className="relative min-h-screen bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-48 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#F2C14E]/10 blur-3xl" />
          <div className="absolute -top-24 left-1/4 h-[420px] w-[620px] rounded-full bg-indigo-500/10 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-[1240px] px-6 py-10 space-y-10">
          <Link
            href="/gamehome"
            className="inline-flex items-center gap-1 text-sm text-white/60 hover:text-white mb-6"
          >
            <ChevronRight className="h-4 w-4 rotate-180" />
            Back to Home
          </Link>

          {/* Hero row (3 columns) */}
          <header className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* LEFT: identity card */}
            <GlassCard className="p-6 lg:col-span-5">
              <div className="flex items-start gap-5">
                <div className="h-20 w-20 rounded-full bg-card/40 border border-border overflow-hidden shrink-0">
                  {data?.user?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={normalizeCover(data.user.avatar_url)} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-2xl font-bold text-muted-foreground">
                      {(data?.user?.display_name ?? data?.user?.username ?? "?")?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {(data?.user?.username ?? "PLAYER").toUpperCase()}
                  </div>
                  <div className="mt-1 text-2xl font-semibold truncate">
                    {data?.user?.display_name ?? data?.user?.username ?? "Unknown"}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <span className="text-muted-foreground">♡</span>
                    <span className="font-medium text-foreground">
                      {vm.primaryArchetype?.label ?? "—"}
                    </span>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    {vm.primaryArchetype?.one_liner ??
                      (identity as any)?.primary_archetype?.one_liner ??
                      "Connect platforms to enrich your identity signals."}
                  </div>

                  <div className="mt-6 space-y-1 text-xs text-muted-foreground">
                    <div>Gaming Since: —</div>
                    <div>Member Since: —</div>
                    <div>First Game Logged: —</div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="text-xs rounded-md border border-border bg-card/40 px-2 py-1 text-muted-foreground">
                      {totals?.owned_games != null ? `${totals.owned_games} games` : "— games"}
                    </span>
                    <span className="text-xs rounded-md border border-border bg-card/40 px-2 py-1 text-muted-foreground">
                      {topSignals?.find((s) => /platform/i.test(s.label))?.label ?? "— platforms"}
                    </span>
                    {hoursPlayed ? (
                      <span className="text-xs rounded-md border border-border bg-card/40 px-2 py-1 text-muted-foreground">
                        {hoursPlayed} hours
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2">
                    {data?.isOwner && (
                      <Link
                        href="/settings"
                        className="px-3 py-1.5 rounded-lg border border-border bg-card/40 text-xs font-medium text-foreground hover:bg-card/60"
                      >
                        Settings
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-3 py-1.5 rounded-lg border border-border bg-card/40 text-xs font-medium text-foreground hover:bg-card/60"
                    >
                      {copied ? "Copied!" : "Copy link"}
                    </button>
                    <Link href={`/users/${encodeURIComponent(vm.user.username)}/card`} className={goldBtn}>
                      Share card
                    </Link>
                  </div>
                </div>
              </div>
            </GlassCard>

            {/* MIDDLE: signals */}
            <GlassCard className="p-6 lg:col-span-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Your Signals</div>

              <div className="mt-5 space-y-5">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                    Most Played
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="h-4 w-1 rounded bg-border" />
                    <span className="font-medium text-foreground">
                      {vm.notableGames?.[0]?.title ?? "—"}
                    </span>
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                    Most Played Genre
                  </div>
                  <div className="mt-2 text-foreground/80">
                    {topSignals?.[1]?.label ?? "—"}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                    Dominant Era
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-[#F2C14E]/80" />
                    <span className="font-medium text-foreground">
                      {(data as any)?.top_era?.label ?? topEraMeta?.label ?? "—"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-card/40 px-4 py-3 text-sm text-muted-foreground">
                {completionRate != null
                  ? `Completion signal: ${completionRate}%`
                  : "Completion signal will appear as you sync achievements."}
              </div>
            </GlassCard>

            {/* RIGHT: score */}
            <GlassCard className="p-6 lg:col-span-3 flex flex-col justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Gamer Life Score</div>

                <div className="mt-3 text-5xl font-semibold tracking-tight text-[#F2C14E]">
                  {fmtInt((identity as any)?.score_total ?? (identity as any)?.lifetime_score ?? vm.lifetimeScore ?? null)}
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  Starting Score: —
                </div>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-5">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                    Games
                  </div>
                  <div className="mt-1 text-lg font-semibold">{fmtInt(totals?.owned_games ?? null)}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                    Hours
                  </div>
                  <div className="mt-1 text-lg font-semibold">{hoursPlayed ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                    Done
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {completionRate != null ? `${completionRate}%` : "—"}
                  </div>
                </div>
              </div>
            </GlassCard>
          </header>

      {/* Your Evolution (Figma tiles) */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Your Evolution</h2>

        <GlassCard className="p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(vm.eras ?? []).slice(0, 6).map((e: any) => {
              const eraKey = e.key ?? e.era_key ?? e.id ?? "";
              const label =
                e.label ?? e.name ?? e.meta?.title ?? getEraMeta(eraKey)?.label ?? "Era";
              const count = e.count ?? e.games ?? e.value ?? e.stats?.games ?? 0;
              const selected = eraKey && (eraKey === vm.topEraKey || eraKey === eraFilter);

              return (
                <button
                  key={eraKey || label}
                  type="button"
                  onClick={() => {
                    if (!eraKey) return;
                    setEraFilter(eraKey);
                    setEraDrawerOpen(true);
                  }}
                  className={[
                    "rounded-xl border p-4 text-left transition-colors",
                    selected
                      ? "border-[#F2C14E]/60 bg-[#F2C14E]/[0.06]"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
                  ].join(" ")}
                >
                  <div className="text-xs text-white/60">{label}</div>
                  <div
                    className={[
                      "mt-1 text-2xl font-semibold",
                      selected ? "text-[#F2C14E]" : "text-white",
                    ].join(" ")}
                  >
                    {count}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between gap-4 text-sm">
            <div className="text-white/60">
              Your strongest signals cluster in{" "}
              <span className="text-[#F2C14E] font-medium">
                {getEraMeta(vm.topEraKey)?.label ?? "your top era"}
              </span>
              .
            </div>

            <Link href="/timeline" className="text-[#F2C14E] hover:underline whitespace-nowrap">
              View Full Timeline →
            </Link>
          </div>
        </GlassCard>
      </section>

      {/* Recently Played (Figma cards) */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Recently Played</h2>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(vm.notableGames?.length ? vm.notableGames.slice(0, 4) : Array.from({ length: 4 })).map(
            (r: any, idx: number) => {
              const hasData = !!r?.release_id;
              const title = hasData ? (r.title ?? "Untitled") : "—";
              const cover = hasData ? normalizeCover(r.cover_url) : null;

              // Simple, honest heuristic (until we have real recency fields):
              const minutes = typeof r?.minutes_played === "number" ? r.minutes_played : null;
              const earned = typeof r?.earned === "number" ? r.earned : null;
              const total = typeof r?.total === "number" ? r.total : null;

              const status = hasData && minutes && minutes > 60 ? "Playing" : "Played";
              const sub =
                hasData && earned != null && total != null
                  ? `${earned}/${total} achievements`
                  : hasData && minutes != null
                    ? `${Math.max(1, Math.round(minutes / 60))}h logged`
                    : hasData
                      ? "Played"
                      : "";

              const href = hasData ? releaseHref(r.release_id) : "#";

              const CardInner = (
                <div className="rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
                  <div className="relative aspect-[4/5]">
                    {cover ? (
                      <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-purple-900/30 to-amber-900/30" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  </div>

                  <div className="p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={[
                          "h-2 w-2 rounded-full",
                          status === "Playing" ? "bg-emerald-400" : "bg-white/50",
                        ].join(" ")}
                      />
                      <span className="text-white/70">{status}</span>
                    </div>

                    <div className="mt-1 font-semibold text-white truncate" title={title}>
                      {title}
                    </div>
                    <div className="mt-0.5 text-sm text-white/60">{sub}</div>
                  </div>
                </div>
              );

              return hasData ? (
                <Link key={r.release_id} href={href} className="block">
                  {CardInner}
                </Link>
              ) : (
                <div key={`ph-${idx}`} aria-hidden className="opacity-70">
                  {CardInner}
                </div>
              );
            }
          )}
        </div>
      </section>

      {/* Curated Collections (placeholder) */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Curated Collections</h2>
          <Link href="/lists" className="text-sm text-muted-foreground hover:underline">
            View all →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { title: "2000s RPGs", count: 24 },
            { title: "Games That Shaped Me", count: 12 },
            { title: "Replay Every Year", count: 8 },
          ].map((c) => (
            <Link key={c.title} href="/lists" className="group">
              <GlassCard className="p-6 hover:bg-card/70 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-lg font-semibold truncate">{c.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{c.count} games</div>
                  </div>
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">→</span>
                </div>

                {/* covers row placeholder (looks like Figma stacks) */}
                <div className="mt-5 flex gap-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-10 w-8 rounded-lg border border-border bg-card/40"
                      style={{ opacity: 0.95 - i * 0.12 }}
                    />
                  ))}
                </div>

                <div className="mt-4 text-sm text-[#F2C14E] font-semibold hover:underline underline-offset-4">
                  View list
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      </section>

      {/* Collection Summary (real counts) */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Collection Summary</h2>

        <CollectionSummary />
      </section>

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
        </div>
      </div>
    </PageShell>
  );
}
