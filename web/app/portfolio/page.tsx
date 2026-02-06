"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Release = {
  id: string;
  display_title: string;
  platform_name: string;
};

const FAKE_USER_ID = "00000000-0000-0000-0000-000000000000";

export default function PortfolioPage() {
  const [query, setQuery] = useState("");
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(false);

  const trimmed = useMemo(() => query.trim(), [query]);

  useEffect(() => {
    // If query is empty, show nothing (clean UX)
    if (!trimmed) {
      setReleases([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Debounce typing by 250ms
    const t = setTimeout(() => {
      fetch(`/api/releases/search?query=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data) => {
          setReleases(Array.isArray(data) ? data : []);
        })
        .catch(() => setReleases([]))
        .finally(() => setLoading(false));
    }, 250);

    return () => clearTimeout(t);
  }, [trimmed]);

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Add a Game</h1>

      {/* Search input */}
      <div style={{ marginBottom: 16 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search releases (e.g., Chrono, Zelda, Metroid)…"
          style={{
            width: "100%",
            maxWidth: 560,
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid #e5e7eb",
            outline: "none",
          }}
        />
        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
          Results are platform-specific releases (SNES vs DS vs Steam show separately).
        </div>
      </div>

      {/* State messaging */}
      {!trimmed && (
        <div style={{ color: "#6b7280" }}>
          Start typing to search your release database.
        </div>
      )}

      {trimmed && loading && (
        <div style={{ color: "#6b7280" }}>Searching…</div>
      )}

      {trimmed && !loading && releases.length === 0 && (
        <div style={{ color: "#6b7280" }}>
          No matches for <strong>{trimmed}</strong>.
        </div>
      )}

      {/* Results */}
      <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
        {releases.map((r) => (
          <Link
            key={r.id}
            href={`/releases/${r.id}`}
            style={{
              display: "block",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: 12,
              textDecoration: "none",
              color: "inherit",
              cursor: "pointer",
              transition:
                "transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease",
            }}
          >
            <div style={{ fontWeight: 600 }}>{r.display_title}</div>
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              {r.platform_name}
            </div>

            <button
              style={{ marginTop: 8 }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();

                fetch("/api/portfolio/upsert", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    user_id: FAKE_USER_ID,
                    release_id: r.id,
                    status: "wishlist",
                  }),
                });
              }}
            >
              Add to Portfolio
            </button>
          </Link>
        ))}
      </div>
    </div>
  );
}
