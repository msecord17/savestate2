"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type PortfolioRow = {
  id: string;
  release_id: string;
  status?: string | null;
  playtime_minutes?: number | null;
  created_at?: string | null;
  release?: {
    id: string;
    platform_key?: string | null;
    display_title?: string | null;
    cover_url?: string | null;
    release_date?: string | null;
    game?: {
      id: string;
      canonical_title?: string | null;
      cover_url?: string | null;
      first_release_year?: number | null;
    } | null;
  } | null;
};

type PhysicalItem = {
  id: string;
  item_type: "game" | "console" | "accessory" | "other";
  title: string;
  platform_key: string | null;
  platform_family: string | null;
  region: string | null;
  condition: string | null;
  is_boxed: boolean | null;
  notes: string | null;
  created_at: string;
};

function norm(s: unknown) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function includesAllTokens(haystack: string, q: string) {
  const tokens = norm(q).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every(t => haystack.includes(t));
}

type SortKey = "recent" | "title" | "platform" | "playtime";

export default function PortfolioClient({
  entries,
  loadError,
}: {
  entries: PortfolioRow[];
  loadError: string | null;
}) {
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("recent");

  // Physical items
  const [physical, setPhysical] = useState<PhysicalItem[]>([]);
  const [physError, setPhysError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Simple "Spotlight-ish" UX: "/" focuses search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && (e.target as HTMLElement)?.tagName !== "INPUT" && (e.target as HTMLElement)?.tagName !== "TEXTAREA") {
        e.preventDefault();
        const el = document.getElementById("portfolio-search") as HTMLInputElement | null;
        el?.focus();
      }
      if (e.key === "Escape") {
        setQuery("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const platformOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of entries) {
      const pk = row.release?.platform_key?.toLowerCase();
      if (pk) set.add(pk);
    }
    return ["all", ...Array.from(set).sort()];
  }, [entries]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    for (const row of entries) {
      const st = norm(row.status);
      if (st) set.add(st);
    }
    return ["all", ...Array.from(set).sort()];
  }, [entries]);

  const filtered = useMemo(() => {
    const q = query;
    let list = entries;

    if (platform !== "all") {
      list = list.filter(r => (r.release?.platform_key ?? "").toLowerCase() === platform);
    }
    if (status !== "all") {
      list = list.filter(r => norm(r.status) === status);
    }

    if (norm(q)) {
      list = list.filter(r => {
        const rel = r.release;
        const game = rel?.game;
        const hay = norm([
          rel?.display_title,
          game?.canonical_title,
          rel?.platform_key,
          r.status,
        ].filter(Boolean).join(" "));
        return includesAllTokens(hay, q);
      });
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "recent") {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bt - at;
      }
      if (sort === "playtime") {
        const ap = a.playtime_minutes ?? 0;
        const bp = b.playtime_minutes ?? 0;
        return bp - ap;
      }
      if (sort === "platform") {
        return norm(a.release?.platform_key).localeCompare(norm(b.release?.platform_key));
      }
      // title: release.display_title first, fallback to game.canonical_title
      const at = norm(a.release?.display_title ?? a.release?.game?.canonical_title);
      const bt = norm(b.release?.display_title ?? b.release?.game?.canonical_title);
      return at.localeCompare(bt);
    });

    return sorted;
  }, [entries, query, platform, status, sort]);

  async function loadPhysical() {
    setPhysError(null);
    try {
      const res = await fetch("/api/portfolio/physical", { cache: "no-store" });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Failed to load physical items");
      setPhysical(json.items ?? []);
    } catch (e: any) {
      setPhysError(e?.message ?? "Failed to load physical items");
    }
  }

  useEffect(() => {
    loadPhysical();
  }, []);

  async function addPhysicalItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    const payload = {
      item_type: String(fd.get("item_type") ?? "game"),
      title: String(fd.get("title") ?? "").trim(),
      platform_key: String(fd.get("platform_key") ?? "").trim() || null,
      region: String(fd.get("region") ?? "").trim() || null,
      condition: String(fd.get("condition") ?? "").trim() || null,
      is_boxed: fd.get("is_boxed") ? true : null,
      notes: String(fd.get("notes") ?? "").trim() || null,
    };

    if (!payload.title) return;

    setAdding(true);
    try {
      const res = await fetch("/api/portfolio/physical", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.error ?? "Failed to add");
      (e.currentTarget as HTMLFormElement).reset();
      await loadPhysical();
    } catch (e: any) {
      alert(e?.message ?? "Failed to add physical item");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>My Portfolio</h1>

        <Link
          href="/add"
          className="rounded-xl border px-3 py-2 text-sm hover:bg-muted"
        >
          Add game
        </Link>

        <input
          id="portfolio-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search your portfolio (press "/" to focus)'
          style={{ flex: "1 1 320px", padding: "10px 12px", borderRadius: 10, border: "1px solid #333" }}
        />

        <select value={platform} onChange={(e) => setPlatform(e.target.value)} style={{ padding: "10px 12px", borderRadius: 10 }}>
          {platformOptions.map(p => <option key={p} value={p}>{p === "all" ? "All platforms" : p}</option>)}
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ padding: "10px 12px", borderRadius: 10 }}>
          {statusOptions.map(s => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
        </select>

        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ padding: "10px 12px", borderRadius: 10 }}>
          <option value="recent">Sort: Recently added</option>
          <option value="title">Sort: Title A–Z</option>
          <option value="platform">Sort: Platform</option>
          <option value="playtime">Sort: Playtime</option>
        </select>
      </div>

      {loadError ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #a33", borderRadius: 10 }}>
          Error loading portfolio: {loadError}
        </div>
      ) : null}

      <div style={{ marginTop: 16, opacity: 0.8 }}>
        Showing <b>{filtered.length}</b> of <b>{entries.length}</b>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
        {filtered.map((row) => {
          const rel = row.release;
          const game = rel?.game;
          const title = rel?.display_title ?? game?.canonical_title ?? "Untitled";
          const cover = game?.cover_url ?? rel?.cover_url ?? null;
          const pk = rel?.platform_key ?? "";
          const playtime = row.playtime_minutes ?? 0;

          return (
            <div key={row.id} style={{ border: "1px solid #333", borderRadius: 14, padding: 12 }}>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ width: 64, height: 86, borderRadius: 10, border: "1px solid #333", overflow: "hidden", background: "#111" }}>
                  {cover ? <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, lineHeight: 1.2 }}>{title}</div>
                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                    {pk ? pk : "—"}{row.status ? ` • ${row.status}` : ""}
                  </div>
                  {playtime > 0 ? (
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      {Math.round(playtime / 60)}h
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Physical Intake */}
      <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid #333" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Physical Collection</h2>
          <button
            onClick={() => {
              const el = document.getElementById("add-physical");
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #333", background: "transparent" }}
          >
            Add physical item
          </button>
        </div>

        {physError ? <div style={{ marginTop: 8, color: "#f88" }}>{physError}</div> : null}

        <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {physical.map((it) => (
            <div key={it.id} style={{ border: "1px solid #333", borderRadius: 14, padding: 12 }}>
              <div style={{ fontWeight: 800 }}>{it.title}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                {it.item_type}{it.platform_key ? ` • ${it.platform_key}` : ""}{it.region ? ` • ${it.region}` : ""}
              </div>
              {it.condition ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>Condition: {it.condition}</div> : null}
              {it.notes ? <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{it.notes}</div> : null}
            </div>
          ))}
          {physical.length === 0 ? (
            <div style={{ opacity: 0.75, padding: 12, border: "1px dashed #333", borderRadius: 14 }}>
              No physical items yet.
            </div>
          ) : null}
        </div>

        <div id="add-physical" style={{ marginTop: 18, border: "1px solid #333", borderRadius: 14, padding: 12 }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Add physical item (v1)</div>
          <form onSubmit={addPhysicalItem} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <select name="item_type" defaultValue="game" style={{ padding: "10px 12px", borderRadius: 10 }}>
              <option value="game">Game</option>
              <option value="console">Console</option>
              <option value="accessory">Accessory</option>
              <option value="other">Other</option>
            </select>

            <input name="platform_key" placeholder="platform_key (optional) e.g., snes, ps2" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #333" }} />

            <input name="title" placeholder="Title (required)" style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: 10, border: "1px solid #333" }} />

            <input name="region" placeholder="Region (optional) e.g., NA, JP, PAL" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #333" }} />
            <input name="condition" placeholder="Condition (optional) e.g., CIB, Loose, Mint" style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #333" }} />

            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, opacity: 0.85 }}>
              <input type="checkbox" name="is_boxed" /> Boxed
            </label>

            <input name="notes" placeholder="Notes (optional)" style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: 10, border: "1px solid #333" }} />

            <button
              type="submit"
              disabled={adding}
              style={{ gridColumn: "1 / -1", padding: "10px 12px", borderRadius: 10, border: "1px solid #333", background: "transparent" }}
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
