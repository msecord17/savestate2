"use client";

import * as React from "react";
import Link from "next/link";
import { releaseHref } from "@/lib/routes";

type SearchItem = {
  id?: string;
  release_id?: string;
  game_id?: string;
  title?: string;
  display_title?: string;
  cover_url?: string | null;
  platform_key?: string | null;
  year?: number | null;
  first_release_year?: number | null;
};

function normalizeResults(json: any): SearchItem[] {
  if (!json) return [];
  if (Array.isArray(json)) return json;
  return (
    json.results ??
    json.releases ??
    json.games ??
    json.items ??
    json.data ??
    []
  );
}

async function searchCatalog(q: string): Promise<SearchItem[]> {
  const query = q.trim();
  if (!query) return [];

  // Try GET first
  let res = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}`, {
    method: "GET",
  });

  if (res.ok) {
    const json = await res.json();
    return normalizeResults(json);
  }

  // Fallback to POST
  res = await fetch(`/api/catalog/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: query }),
  });

  if (!res.ok) return [];
  const json = await res.json();
  return normalizeResults(json);
}

export default function AddGamePageClient({ initialQuery }: { initialQuery: string }) {
  const [q, setQ] = React.useState(initialQuery ?? "");
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<SearchItem[]>([]);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const query = q.trim();
      if (!query) {
        setItems([]);
        setErr(null);
        return;
      }
      setLoading(true);
      setErr(null);
      try {
        const results = await searchCatalog(query);
        if (!alive) return;
        setItems(results);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Search failed");
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Add a game</h1>
          <p className="text-sm text-muted-foreground">
            Search releases and jump into the release page to add to your portfolio.
          </p>
        </div>
        <Link
          href="/portfolio"
          className="text-sm underline underline-offset-4 opacity-80 hover:opacity-100"
        >
          Back to Portfolio
        </Link>
      </div>

      <div className="mt-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search (e.g., Super Mario World, Halo 3, Chrono Trigger)…"
          className="w-full rounded-xl border px-4 py-3 text-base outline-none focus:ring-2"
          autoFocus
        />
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <div>
            {loading ? "Searching…" : err ? `Error: ${err}` : items.length ? `${items.length} results` : " "}
          </div>
          <div className="opacity-70">Tip: paste a full title, then refine</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        {items.map((it, idx) => {
          const id = it.release_id ?? it.id ?? `${idx}`;
          const rid = it.release_id ?? it.id;
          const title = it.display_title ?? it.title ?? "Untitled";
          const year = it.year ?? it.first_release_year ?? null;
          const platform = it.platform_key ?? null;
          const cover = it.cover_url ?? null;

          return (
            <div key={id} className="flex gap-3 rounded-2xl border p-3">
              <div className="h-16 w-12 overflow-hidden rounded-xl bg-muted">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{title}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {platform ? platform.toUpperCase() : "—"}
                  {year ? ` • ${year}` : ""}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {rid ? (
                  <Link
                    href={releaseHref(rid)}
                    className="rounded-xl border px-3 py-2 text-sm hover:bg-muted"
                  >
                    Open
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">No release ID</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!loading && q.trim() && items.length === 0 && !err ? (
        <div className="mt-10 rounded-2xl border p-6 text-sm text-muted-foreground">
          No results. Try a shorter query (drop punctuation / subtitles), or search by a franchise name.
        </div>
      ) : null}
    </div>
  );
}
