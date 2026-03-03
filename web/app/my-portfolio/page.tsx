"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { releaseHref } from "@/lib/routes";
import PhysicalIntakeCard from "@/components/portfolio/PhysicalIntakeCard";

type PortfolioRow = {
  release_id: string;
  status: string;
  release?: {
    id: string;
    display_title?: string | null;
    platform_key?: string | null;
    cover_url?: string | null;
    game?: {
      id: string;
      canonical_title?: string | null;
      cover_url?: string | null;
      first_release_year?: number | null;
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
  const [physical, setPhysical] = useState<any[]>([]);
  const [physicalErr, setPhysicalErr] = useState("");

  const [hardware, setHardware] = useState<any[]>([]);
  const [playedOnMap, setPlayedOnMap] = useState<Record<string, any>>({});
  const [defaultRaHardwareId, setDefaultRaHardwareId] = useState<string | null>(null);

  function loadHardware() {
    fetch("/api/hardware/list")
      .then((r) => r.json())
      .then((d) => setHardware(d?.ok ? (d.items ?? []) : []))
      .catch(() => setHardware([]));
  }

  function loadPlayedOn() {
    fetch("/api/portfolio/played-on/list")
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) return setPlayedOnMap({});
        const map: Record<string, any> = {};
        for (const it of d.items ?? []) map[it.release_id] = it;
        setPlayedOnMap(map);
      })
      .catch(() => setPlayedOnMap({}));
  }

  function loadDefaultRaDevice() {
    fetch("/api/profile/default-ra-device")
      .then((r) => r.json())
      .then((d) => setDefaultRaHardwareId(d?.ok ? (d.default_ra_hardware_id ?? null) : null))
      .catch(() => setDefaultRaHardwareId(null));
  }

  async function setDefaultRaDevice(hardware_id: string | null) {
    await fetch("/api/profile/default-ra-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hardware_id }),
    });
    loadDefaultRaDevice();
  }

  async function setPlayedOn(release_id: string, hardware_slug: string | null) {
    await fetch("/api/portfolio/played-on/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ release_id, hardware_slug, source: "manual" }),
    });
    loadPlayedOn();
  }

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

  function loadPhysical() {
    setPhysicalErr("");
    fetch("/api/portfolio/physical/list")
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) setPhysical(Array.isArray(d.items) ? d.items : []);
        else setPhysicalErr(d?.error || "Failed to load physical items");
      })
      .catch(() => setPhysicalErr("Failed to load physical items"));
  }

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const rel = r.release;

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

    loadPhysical();
    loadHardware();
    loadPlayedOn();
    loadDefaultRaDevice();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 26, marginBottom: 12 }}>My Portfolio</h1>

      <div style={{ marginBottom: 12 }}>
        <Link href="/add-games" style={{ color: "#2563eb" }}>
          + Add games
        </Link>
      </div>

      <div
        style={{
          marginTop: 12,
          marginBottom: 16,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 12,
          background: "white",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Physical collection</div>
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
              Quick manual entries for owned games/systems/accessories.
            </div>
          </div>

          <Link href="/add-physical" style={{ color: "#2563eb", fontSize: 13 }}>
            + Add physical
          </Link>
        </div>

        {physicalErr ? (
          <div style={{ color: "#b91c1c", marginTop: 10, fontSize: 13 }}>{physicalErr}</div>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {physical.length === 0 ? (
              <div style={{ color: "#6b7280", fontSize: 13 }}>
                No physical items yet.
              </div>
            ) : (
              physical.slice(0, 8).map((it) => (
                <div
                  key={it.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #e5e7eb",
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.title}
                    </div>
                    <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>
                      {it.kind ?? "other"}
                      {it.platform_key ? ` • ${it.platform_key}` : ""}
                      {it.condition ? ` • ${it.condition}` : ""}
                      {it.quantity ? ` • x${it.quantity}` : ""}
                    </div>
                  </div>
                  <div style={{ color: "#94a3b8", fontSize: 12, flexShrink: 0 }}>
                    {it.created_at ? new Date(it.created_at).toLocaleDateString() : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12, marginBottom: 16, border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "white" }}>
        <div style={{ fontWeight: 900, marginBottom: 6 }}>RetroAchievements default device</div>
        <div style={{ color: "#64748b", fontSize: 13, marginBottom: 8 }}>
          Used when we can't detect hardware. New RA sync will auto-assign to this device unless you override per game.
        </div>
        <select
          value={defaultRaHardwareId ?? ""}
          onChange={(e) => setDefaultRaDevice(e.target.value || null)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white" }}
        >
          <option value="">None</option>
          {hardware
            .filter((h) => h.kind === "handheld" || h.kind === "console")
            .map((h) => (
              <option key={h.id} value={h.id}>
                {h.display_name}
              </option>
            ))}
        </select>
      </div>

      <div style={{ position: "sticky", top: 12, zIndex: 20 }}>
        <div
          style={{
            marginTop: 12,
            marginBottom: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 12,
            background: "white",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14 }}>Quick add</div>
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 2 }}>
              Add physical games / hardware without scrolling into oblivion.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Link href="/add-games" style={{ color: "#2563eb", fontWeight: 800 }}>
              + Add digital game
            </Link>
          </div>
        </div>

          <div style={{ marginTop: 10 }}>
            <PhysicalIntakeCard onCreated={loadPhysical} />
          </div>
        </div>
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
          const rel = r.release;
          const title = rel?.display_title ?? rel?.game?.canonical_title ?? "Untitled";

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
                    const coverUrl = rel?.game?.cover_url ?? rel?.cover_url;
                    const cover =
                      coverUrl &&
                      !coverUrl.includes("unknown.png") &&
                      !coverUrl.includes("placeholder")
                        ? coverUrl
                        : "/images/placeholder-cover.png";
                    return (
                      <img
                        src={cover}
                        alt={title}
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
    {title}
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
                    {rel?.platform_key ?? "—"} • Status:{" "}
                    <strong>{String(r.status ?? "").replace("_", " ")}</strong>
                    {rel?.game?.first_release_year ? (
                      <span> • {rel.game.first_release_year}</span>
                    ) : null}
                  </div>

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

                    {/* Played On */}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>Played On</div>
                      <select
                        value={playedOnMap[r.release_id]?.hardware?.slug ?? ""}
                        onChange={(e) => setPlayedOn(r.release_id, e.target.value || null)}
                        style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid #e5e7eb", background: "white" }}
                      >
                        <option value="">Played on…</option>
                        {hardware
                          .filter((h) => h.kind === "handheld" || h.kind === "console" || h.kind === "computer")
                          .map((h) => (
                            <option key={h.id} value={h.slug ?? h.id}>
                              {h.display_name ?? h.slug}
                            </option>
                          ))}
                      </select>
                      {playedOnMap[r.release_id]?.hardware?.display_name ? (
                        <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>
                          Selected: <strong>{playedOnMap[r.release_id].hardware.display_name}</strong>
                        </div>
                      ) : null}
                    </div>

                    {rel?.id && (
                      <Link
                        href={releaseHref(rel.id)}
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
