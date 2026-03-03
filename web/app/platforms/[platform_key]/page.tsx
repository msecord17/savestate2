"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { MemoryTile } from "@/components/memory/MemoryTile";

type PlatformItem = {
  id: string;
  display_title: string;
  platform_key: string | null;
  cover_url: string | null;
  release_date: string | null;
  first_release_year: number | null;
};

type PlatformMeta = {
  display_name: string;
  total: number;
  year_min: number | null;
  year_max: number | null;
};

const AZ = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export default function PlatformPage() {
  const params = useParams<{ platform_key: string }>();
  const router = useRouter();
  const slugFromUrl = params?.platform_key ?? "";
  const platformKey = slugFromUrl;

  // Redirect human-friendly slugs to canonical platform_key (e.g. /platforms/nintendo-64 → /platforms/n64)
  useEffect(() => {
    if (!slugFromUrl) return;
    fetch(`/api/platforms/resolve?slug=${encodeURIComponent(slugFromUrl)}`)
      .then((r) => r.json())
      .then((data) => {
        const canonical = data?.platform_key;
        if (canonical && canonical.toLowerCase() !== slugFromUrl.toLowerCase()) {
          router.replace(`/platforms/${encodeURIComponent(canonical)}`);
        }
      })
      .catch(() => {});
  }, [slugFromUrl, router]);

  const [meta, setMeta] = useState<PlatformMeta | null>(null);
  const [items, setItems] = useState<PlatformItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [letter, setLetter] = useState<string>("all");
  const [year, setYear] = useState<string>("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [rememberedIds, setRememberedIds] = useState<Set<string>>(new Set());

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      if (!platformKey) return;
      const url = new URL(`/api/platforms/${encodeURIComponent(platformKey)}`, window.location.origin);
      url.searchParams.set("letter", letter);
      if (year) url.searchParams.set("year", year);
      if (cursor) url.searchParams.set("cursor", cursor);

      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const res = await fetch(url.toString());
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Failed");

        if (append) {
          setItems((prev) => [...prev, ...(data.items ?? [])]);
        } else {
          setItems(data.items ?? []);
        }
        setMeta(data.meta ?? null);
        setNextCursor(data.nextCursor ?? null);
        setError("");
      } catch (e: any) {
        setError(e?.message ?? "Failed to load");
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [platformKey, letter, year]
  );

  useEffect(() => {
    setNextCursor(null);
    fetchPage(null, false);
  }, [platformKey, letter, year, fetchPage]);

  // Fetch remembered status when items change
  useEffect(() => {
    if (items.length === 0) return;
    const ids = items.map((i) => i.id).filter(Boolean);
    if (ids.length === 0) return;
    fetch(`/api/memory/check?release_ids=${ids.join(",")}`)
      .then((r) => r.json())
      .then((data) => {
        setRememberedIds(new Set(data.remembered ?? []));
      })
      .catch(() => {});
  }, [items]);

  const loadMore = () => {
    if (nextCursor && !loadingMore) fetchPage(nextCursor, true);
  };

  const yearRange = meta?.year_min != null && meta?.year_max != null
    ? `${meta.year_min}–${meta.year_max}`
    : meta?.year_min != null
      ? String(meta.year_min)
      : meta?.year_max != null
        ? String(meta.year_max)
        : "—";

  const yearOptions = useMemo(() => {
    if (meta?.year_min == null || meta?.year_max == null) return [];
    const out: number[] = [];
    for (let y = meta.year_max; y >= meta.year_min; y--) out.push(y);
    return out;
  }, [meta?.year_min, meta?.year_max]);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-6">
        <Link
          href="/"
          className="mb-4 inline-block text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          ← Back
        </Link>

        {/* Header */}
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            {meta?.display_name ?? platformKey}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {meta?.total != null
              ? `${meta.total.toLocaleString()} titles`
              : "—"}{" "}
            {yearRange !== "—" && ` · ${yearRange}`}
          </p>
        </header>

        {/* A–Z bar */}
        <div className="mb-4 flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setLetter("all")}
            className={`rounded px-2 py-1 text-xs font-medium transition ${
              letter === "all"
                ? "bg-accent text-accent-foreground"
                : "border border-border bg-card text-foreground hover:bg-accent/20"
            }`}
          >
            All
          </button>
          {AZ.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLetter(l.toLowerCase())}
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium transition ${
                letter === l.toLowerCase()
                  ? "bg-accent text-accent-foreground"
                  : "border border-border bg-card text-foreground hover:bg-accent/20"
              }`}
            >
              {l}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setLetter("#")}
            className={`rounded px-2 py-1 text-xs font-medium transition ${
              letter === "#"
                ? "bg-accent text-accent-foreground"
                : "border border-border bg-card text-foreground hover:bg-accent/20"
            }`}
          >
            #
          </button>
        </div>

        {/* Year dropdown */}
        <div className="mb-6 flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground">Year</label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">All years</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No titles found for this platform.
          </div>
        ) : (
          <>
            {/* Cover grid */}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
              {items.map((item) => (
                <MemoryTile
                  key={item.id}
                  item={item}
                  remembered={rememberedIds.has(item.id)}
                  onRememberChange={(id, remembered) => {
                    setRememberedIds((prev) => {
                      const next = new Set(prev);
                      if (remembered) next.add(id);
                      else next.delete(id);
                      return next;
                    });
                  }}
                />
              ))}
            </div>

            {/* Load more */}
            {nextCursor && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="rounded-lg border border-border bg-card px-6 py-2.5 text-sm font-medium text-foreground transition hover:bg-accent/20 disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

