"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type ReleaseDetail = {
  id: string;
  display_title: string | null;
  platform_name: string | null;
  platform_key: string | null;
  cover_url: string | null;
  games: {
    id: string;
    canonical_title: string | null;
    igdb_game_id: number | null;
    summary: string | null;
    genres: any | null; // stored as jsonb; we’ll normalize in UI
    developer: string | null;
    publisher: string | null;
    first_release_year: number | null;
  } | null;
};

export default function ReleaseDetailPage() {
  const params = useParams<{ id: string }>();
  const releaseId = params?.id;

  const [release, setRelease] = useState<ReleaseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // For actions
  const [myLists, setMyLists] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("playing");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const title = useMemo(() => {
    return (
      release?.display_title ??
      release?.games?.canonical_title ??
      "Untitled"
    );
  }, [release]);

  const genresList = useMemo(() => {
    const g: any = release?.games?.genres;
    if (!g) return [];
    if (Array.isArray(g)) return g.filter(Boolean);
    // if jsonb stored as { ... } accidentally, fallback:
    if (typeof g === "string") return [g];
    return [];
  }, [release]);

  useEffect(() => {
    if (!releaseId) return;

    async function load() {
      try {
        setLoading(true);
        setErr("");

        const res = await fetch(`/api/releases/${releaseId}`);
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;

        if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

        const r: ReleaseDetail | null = data?.release ?? null;
        setRelease(r);

        // default status: if you later want to fetch the existing portfolio status, we can.
        setStatus("playing");
      } catch (e: any) {
        setErr(e?.message || "Failed to load release");
        setRelease(null);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [releaseId]);

  useEffect(() => {
    // lists for dropdown
    fetch("/api/lists")
      .then((r) => r.json())
      .then((d) => setMyLists(Array.isArray(d) ? d : []))
      .catch(() => setMyLists([]));
  }, []);

  async function saveStatus(nextStatus: string) {
    if (!releaseId) return;

    try {
      setSaving(true);
      setMsg("");

      const res = await fetch("/api/portfolio/upsert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          release_id: releaseId,
          status: nextStatus,
        }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setStatus(nextStatus);
      setMsg("Saved ✅");
      setTimeout(() => setMsg(""), 1200);
    } catch (e: any) {
      setMsg(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addToList(listId: string) {
    if (!releaseId) return;

    try {
      setSaving(true);
      setMsg("");

      const res = await fetch("/api/lists/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ list_id: listId, release_id: releaseId }),
      });

      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

      setMsg("Added to list ✅");
      setTimeout(() => setMsg(""), 1200);
    } catch (e: any) {
      setMsg(e?.message || "Add failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/my-portfolio" style={{ color: "#2563eb" }}>
          ← Back to My Portfolio
        </Link>
      </div>

      {loading && <div style={{ color: "#6b7280" }}>Loading…</div>}
      {err && <div style={{ color: "#b91c1c" }}>{err}</div>}

      {!loading && release && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 16,
            background: "white",
          }}
        >
          <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
            {/* Cover */}
            <div
              style={{
                width: 180,
                height: 240,
                borderRadius: 16,
                border: "1px solid #e5e7eb",
                background: "#f8fafc",
                overflow: "hidden",
                flexShrink: 0,
              }}
            >
              {release.cover_url ? (
                <img
                  src={release.cover_url}
                  alt={title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : null}
            </div>

            {/* Main info */}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>
                {title}
              </div>

              <div style={{ color: "#64748b", marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  {release.platform_name ?? "—"}
                  {release.games?.first_release_year ? ` • ${release.games.first_release_year}` : ""}
                </div>

                {release.games?.igdb_game_id ? (
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
                    title="Metadata enriched from IGDB"
                  >
                    IGDB
                  </div>
                ) : null}
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 14,
                  alignItems: "center",
                }}
              >
                <select
                  value={status}
                  onChange={(e) => saveStatus(e.target.value)}
                  disabled={saving}
                  style={{
                    padding: "9px 10px",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    fontWeight: 700,
                  }}
                >
                  <option value="playing">playing</option>
                  <option value="completed">completed</option>
                  <option value="dropped">dropped</option>
                  <option value="back_burner">back burner</option>
                  <option value="wishlist">wishlist</option>
                  <option value="owned">owned</option>
                </select>

                {myLists.length > 0 && (
                  <select
                    defaultValue=""
                    disabled={saving}
                    onChange={(e) => {
                      const listId = e.target.value;
                      if (!listId) return;
                      addToList(listId);
                      e.currentTarget.value = "";
                    }}
                    style={{
                      padding: "9px 10px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 700,
                    }}
                  >
                    <option value="">Add to list…</option>
                    {myLists.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {(l.title ?? l.name) || "Untitled list"}
                      </option>
                    ))}
                  </select>
                )}

                {msg ? (
                  <div style={{ color: "#64748b", fontSize: 13 }}>{msg}</div>
                ) : null}
              </div>

              {/* Summary */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Summary</div>
                <div style={{ color: "#334155", lineHeight: 1.5 }}>
                  {release.games?.summary ?? "—"}
                </div>
              </div>

              {/* Details */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Details</div>

                <div style={{ color: "#334155", lineHeight: 1.7 }}>
                  <div>
                    <strong>Developer:</strong> {release.games?.developer ?? "—"}
                  </div>
                  <div>
                    <strong>Publisher:</strong> {release.games?.publisher ?? "—"}
                  </div>

                  <div style={{ marginTop: 8 }}>
                    <strong>Genres:</strong>{" "}
                    {genresList.length > 0 ? (
                      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", marginLeft: 6 }}>
                        {genresList.map((g: string) => (
                          <span
                            key={g}
                            style={{
                              fontSize: 12,
                              padding: "3px 8px",
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
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
