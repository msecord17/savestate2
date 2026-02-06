"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";

type PortfolioRow = {
  release_id: string;
  status: string;
  releases: {
    id: string;
    display_title: string;
    platform_name: string;
    platform_key?: string | null;
    cover_url?: string | null;
    games?: {
      first_release_year?: number | null;
      developer?: string | null;
      genres?: any | null;
      cover_url?: string | null;
    } | null;
  } | null;
};

export default function MyPortfolioPage() {
  const [rows, setRows] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "steam" | "psn" | "xbox" | "ra" | "manual">("all");

  const [myLists, setMyLists] = useState<any[]>([]);
  const [listCounts, setListCounts] = useState<Record<string, number>>({});

  async function refresh() {
    try {
      setLoading(true);
      setErr("");

      const res = await fetch("/api/portfolio/list");
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || "Failed to load portfolio");
      setRows(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setErr(e?.message || "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(releaseId: string, nextStatus: string) {
    await fetch("/api/portfolio/upsert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        release_id: releaseId,
        status: nextStatus,
      }),
    });
    refresh();
  }

  async function addToList(listId: string, releaseId: string) {
    await fetch("/api/lists/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ list_id: listId, release_id: releaseId }),
    });
    refresh();
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const rel = r.releases;

      // Source filter (platform_key)
      if (sourceFilter !== "all") {
        const key = (rel?.platform_key || "").toLowerCase();

        const isSteam = key === "steam";
        const isPSN = key === "psn";
        const isXbox = key === "xbox";
        const isRA = key === "retroachievements" || key === "ra";
        // Manual = anything that's NOT steam, PSN, Xbox, and NOT retroachievements/ra
        const isManual = !isSteam && !isPSN && !isXbox && !isRA;

        if (sourceFilter === "steam" && !isSteam) return false;
        if (sourceFilter === "psn" && !isPSN) return false;
        if (sourceFilter === "xbox" && !isXbox) return false;
        if (sourceFilter === "ra" && !isRA) return false;
        if (sourceFilter === "manual" && !isManual) return false;
      }

      return true;
    });
  }, [rows, sourceFilter]);

  useEffect(() => {
    refresh();

    fetch("/api/lists")
      .then((r) => r.json())
      .then((d) => setMyLists(Array.isArray(d) ? d : []))
      .catch(() => setMyLists([]));

    fetch("/api/lists/memberships")
      .then((r) => r.json())
      .then((d) => setListCounts(d?.counts ?? {}))
      .catch(() => setListCounts({}));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 26, marginBottom: 12 }}>My Portfolio</h1>

      <div style={{ marginBottom: 12 }}>
        <Link href="/add-games" style={{ color: "#2563eb" }}>
          + Add games
        </Link>
      </div>

      {loading && <div style={{ color: "#6b7280" }}>Loading…</div>}
      {err && <div style={{ color: "#b91c1c" }}>{err}</div>}

      {!loading && rows.length === 0 && (
        <div style={{ color: "#6b7280" }}>
          Nothing here yet. Go to <Link href="/add-games">Add games</Link>.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10, marginBottom: 12 }}>
        {[
          { key: "all", label: "All" },
          { key: "steam", label: "Steam" },
          { key: "psn", label: "PlayStation" },
          { key: "xbox", label: "Xbox" },
          { key: "ra", label: "RetroAchievements" },
          { key: "manual", label: "Manual" },
        ].map((b) => (
          <button
            key={b.key}
            type="button"
            onClick={() => setSourceFilter(b.key as any)}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: sourceFilter === b.key ? "#0f172a" : "white",
              color: sourceFilter === b.key ? "white" : "#0f172a",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {b.label}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {filtered.map((r) => {
          const rel = r.releases;

          return (
            <div
              key={r.release_id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 12,
                background: "white",
              }}
            >
              <div style={{ display: "flex", gap: 12 }}>
                {/* COVER */}
                <div
                  style={{
                    width: 90,
                    height: 120,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#f8fafc",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  {(() => {
                    const coverUrl = rel?.games?.cover_url ?? rel?.cover_url;
                    const cover =
                      coverUrl &&
                      !coverUrl.includes("unknown.png") &&
                      !coverUrl.includes("placeholder")
                        ? coverUrl
                        : "/images/placeholder-cover.png";
                    return (
                      <img
                        src={cover}
                        alt={rel?.display_title ?? "Cover"}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                      />
                    );
                  })()}
                </div>

                {/* INFO + CONTROLS */}
                <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
  <div style={{ fontWeight: 900 }}>
    {rel ? rel.display_title : "Missing release"}
  </div>

  {rel?.platform_key === "steam" && (
    <div
      style={{
        fontSize: 12,
        padding: "3px 8px",
        borderRadius: 999,
        border: "1px solid #e5e7eb",
        background: "white",
        color: "#0f172a",
        lineHeight: 1.2,
      }}
      title="Synced from Steam"
    >
      Steam
    </div>
  )}

  {rel?.platform_key === "psn" && (
    <div
      style={{
        fontSize: 12,
        padding: "3px 8px",
        borderRadius: 999,
        border: "1px solid #e5e7eb",
        background: "white",
        color: "#0f172a",
        lineHeight: 1.2,
      }}
      title="Synced from PlayStation"
    >
      PlayStation
    </div>
  )}

  {rel?.platform_key === "xbox" && (
    <div
      style={{
        fontSize: 12,
        padding: "3px 8px",
        borderRadius: 999,
        border: "1px solid #e5e7eb",
        background: "white",
        color: "#0f172a",
        lineHeight: 1.2,
      }}
      title="Synced from Xbox"
    >
      Xbox
    </div>
  )}
</div>


                  <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                    {rel?.platform_name ?? "—"} • Status:{" "}
                    <strong>{String(r.status ?? "").replace("_", " ")}</strong>
                  </div>
                  
                  {rel?.games && (
  <div
    style={{
      color: "#64748b",
      fontSize: 13,
      marginTop: 4,
      display: "flex",
      gap: 8,
      flexWrap: "wrap",
    }}
  >
    {rel.games.first_release_year ? (
      <span>{rel.games.first_release_year}</span>
    ) : null}

    {rel.games.developer ? (
      <span>• {rel.games.developer}</span>
    ) : null}

    {Array.isArray(rel.games.genres) && rel.games.genres.length > 0 ? (
      <span style={{ display: "inline-flex", gap: 6 }}>
        {rel.games.genres.slice(0, 2).map((g: string) => (
          <span
            key={g}
            style={{
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 999,
              border: "1px solid #e5e7eb",
              background: "white",
              color: "#0f172a",
              lineHeight: 1.2,
            }}
          >
            {g}
          </span>
        ))}
      </span>
    ) : null}
  </div>
)}

                  {(listCounts[r.release_id] ?? 0) > 0 && (
                    <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                      In {listCounts[r.release_id]} list
                      {listCounts[r.release_id] > 1 ? "s" : ""}
                    </div>
                  )}

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      marginTop: 10,
                    }}
                  >
                    {/* Status */}
                    <select
                      value={r.status}
                      onChange={(e) =>
                        updateStatus(r.release_id, e.target.value)
                      }
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                        background: "white",
                      }}
                    >
                      <option value="playing">playing</option>
                      <option value="completed">completed</option>
                      <option value="dropped">dropped</option>
                      <option value="back_burner">back burner</option>
                      <option value="wishlist">wishlist</option>
                      <option value="owned">owned</option>
                    </select>

                    {/* Add to list */}
                    {myLists.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const listId = e.target.value;
                          if (!listId) return;
                          addToList(listId, r.release_id);
                          e.currentTarget.value = "";
                        }}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid #e5e7eb",
                          background: "white",
                        }}
                      >
                        <option value="">Add to list…</option>
                        {myLists.map((l) => (
                          <option key={l.id} value={l.id}>
                            {(l.title ?? l.name) || "Untitled list"}
                          </option>
                        ))}
                      </select>
                    )}

                    {rel?.id && (
                      <Link
                        href={`/releases/${rel.id}`}
                        style={{ color: "#2563eb", fontSize: 13 }}
                      >
                        Open details →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
