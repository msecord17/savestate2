"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const SYNC_ENDPOINTS: Record<string, string> = {
  psn: "/api/sync/psn",
  xbox: "/api/sync/xbox",
  steam: "/api/sync/steam-thin",
  steam_enrich: "/api/sync/steam-enrich",
  ra: "/api/sync/retroachievements",
};

const CONNECT_URLS: Record<string, string> = {
  steam: "/api/auth/steam/start",
  xbox: "/api/auth/xbox/start",
  psn: "/api/auth/psn/connect",
  ra: "/api/auth/retroachievements/start",
};

function normalizeSyncSummary(platformKey: string, data: any) {
  if (!data) return {};

  // Steam-thin and steam-enrich match nicely
  if (platformKey === "steam" || platformKey === "steam_enrich") {
    return {
      line1: `${data.mapped ?? 0}/${data.total ?? 0} mapped · ${data.portfolio_upserted ?? 0} added`,
      line2: data.releases_created ? `${data.releases_created} new releases` : null,
      warn: Array.isArray(data.errors) && data.errors.length ? `${data.errors.length} warnings` : null,
      note: data.note ?? null,
    };
  }

  if (platformKey === "psn") {
    const played = data.played?.total ?? 0;
    const trophies = data.trophies?.total ?? 0;
    const titles = data.trophy_groups?.unique_titles ?? 0;
    return {
      line1: `${played} played · ${trophies} trophies · ${titles} titles`,
      line2: data.releases_touched ? `${data.releases_touched} releases touched` : null,
      note: data.note ?? null,
    };
  }

  if (platformKey === "xbox") {
    const processed = data.processed ?? 0;
    const total = data.total ?? 0;
    const gt = data.gamertag ? `· ${data.gamertag}` : "";
    const warns = data.warning ? "warning" : null;
    const errCount = Array.isArray(data.errors) ? data.errors.length : 0;
    return {
      line1: `${processed}/${total} processed ${gt}`.trim(),
      line2: data.imported || data.updated ? `${data.imported ?? 0} imported · ${data.updated ?? 0} updated` : null,
      warn: errCount ? `${errCount} warnings` : warns,
      note: data.warning ?? null,
    };
  }

  if (platformKey === "ra") {
    return {
      line1: `imported ${data.imported ?? 0}${data.username ? ` · ${data.username}` : ""}`,
      note: data.note ?? null,
    };
  }

  // default
  return {
    line1: "Synced",
    note: data.note ?? null,
  };
}

const goldBtn =
  "inline-flex items-center justify-center h-12 px-7 rounded-[var(--radius-xl)] bg-[#F2C14E] text-black font-semibold hover:bg-[#F2C14E]/90 active:scale-[0.99] transition";
const darkBtn =
  "inline-flex items-center justify-center h-12 px-7 rounded-[var(--radius-xl)] border border-border bg-card/40 text-foreground font-semibold hover:bg-card/60 transition";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[#F2C14E]/10 blur-3xl" />
        <div className="absolute -top-24 left-1/4 h-[420px] w-[620px] rounded-full bg-indigo-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-[920px] px-6 py-12">{children}</div>
    </div>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
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

type Platform = {
  key: string;
  label: string;
  connected: boolean;
  last_sync: string | null;
  status: "connected" | "disconnected";
  sync_status?: string | null;
  last_sync_duration_ms?: number | null;
  last_error_message?: string | null;
};

type SyncStatus = {
  running: boolean;
  ok?: boolean;
  error?: string;
  lastRunAt?: string;
  ui?: { line1?: string; line2?: string | null; warn?: string | null; note?: string | null };
  raw?: any;
};

export default function ConnectPage() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, SyncStatus>>({});
  const [unauthorized, setUnauthorized] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/users/me/connections", { cache: "no-store" });
      if (res.status === 401) {
        setPlatforms([]);
        setUnauthorized(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setPlatforms(data?.platforms ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function syncPlatform(key: string) {
    const url = SYNC_ENDPOINTS[key];
    if (!url) return;

    setSyncing((s) => ({ ...s, [key]: { running: true } }));

    try {
      const res = await fetch(url, { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false) {
        throw new Error(data?.error || res.statusText);
      }

      const ui = normalizeSyncSummary(key, data);

      setSyncing((s) => ({
        ...s,
        [key]: { running: false, ok: true, lastRunAt: new Date().toISOString(), ui, raw: data },
      }));

      // refresh connection status after sync
      await load();
    } catch (e: any) {
      setSyncing((s) => ({
        ...s,
        [key]: { running: false, ok: false, error: e?.message ?? "Sync failed", raw: { error: e?.message ?? "Sync failed" } },
      }));
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <Shell>
        <Card className="max-w-md p-6">
          <div className="text-lg font-semibold">Log in to connect platforms</div>
          <Link href="/login?next=/connect" className={`mt-5 block text-center ${goldBtn}`}>
            Continue to login
          </Link>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card className="p-10">
        <h1 className="text-4xl font-semibold tracking-tight">Connect Your Gaming Accounts</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Link your gaming platforms to automatically sync your library and achievements
        </p>

        <div className="mt-10 space-y-4">
          {platforms.map((p) => {
            const running = !!syncing?.[p.key]?.running;
            const connected = !!p.connected;

            return (
              <div
                key={p.key}
                className="flex items-center justify-between gap-4 rounded-[var(--radius-xl)] border border-border bg-card/40 px-6 py-5"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-xl bg-card/40 border border-border flex items-center justify-center">
                    <span className="text-lg">🎮</span>
                  </div>
                  <div className="text-lg font-semibold">{p.label}</div>
                </div>

                {!connected ? (
                  <Link
                    href={CONNECT_URLS[p.key] ?? "#"}
                    className="inline-flex h-11 items-center justify-center rounded-[var(--radius-xl)] bg-[#F2C14E] text-black font-semibold px-6 hover:bg-[#F2C14E]/90 transition"
                  >
                    Connect
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => syncPlatform(p.key)}
                    disabled={running}
                    className="inline-flex h-11 items-center justify-center rounded-[var(--radius-xl)] bg-[#F2C14E] text-black font-semibold px-6 hover:bg-[#F2C14E]/90 transition disabled:opacity-50"
                  >
                    {running ? "Syncing…" : "Sync now"}
                  </button>
                )}
              </div>
            );
          })}

          {/* coming soon rows */}
          {[
            { label: "Nintendo Network" },
            { label: "Epic Games" },
          ].map((x) => (
            <div
              key={x.label}
              className="flex items-center justify-between gap-4 rounded-[var(--radius-xl)] border border-border bg-card/20 px-6 py-5 opacity-60"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-card/40 border border-border flex items-center justify-center">
                  <span className="text-lg">🎮</span>
                </div>
                <div className="text-lg font-semibold">{x.label}</div>
              </div>
              <button
                type="button"
                disabled
                className="inline-flex h-11 items-center justify-center rounded-[var(--radius-xl)] border border-border bg-card/30 text-foreground px-6 font-semibold cursor-not-allowed"
              >
                Connect
              </button>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-center gap-4">
          <Link href="/gamehome" className={[goldBtn, "flex-1"].join(" ")}>
            Continue to GameHome
          </Link>
          <Link href="/onboarding/create-account" className={darkBtn}>
            Back
          </Link>
        </div>

        <div className="mt-5 text-center">
          <Link href="/gamehome" className="text-sm text-muted-foreground hover:underline">
            Skip for now
          </Link>
        </div>
      </Card>
    </Shell>
  );
}
