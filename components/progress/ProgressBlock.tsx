// components/progress/ProgressBlock.tsx
"use client";

export type ProgressSignal = {
  source: "steam" | "psn" | "xbox" | "ra";
  label: string;            // Steam, PSN, Xbox, RetroAchievements
  progressPct?: number;     // trophies / achievements %
  earned?: number;
  total?: number;
  playtimeMinutes?: number;
  lastUpdatedAt?: string | null;
  ra_status?: "unmapped" | "no_set" | "has_set" | null;  // RA-specific status
};

function formatPlaytime(minutes?: number | null) {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours <= 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export default function ProgressBlock({
  signals,
}: {
  signals: ProgressSignal[];
}) {
  if (!signals || signals.length === 0) return null;

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      {signals.map((signal) => {
        // Handle RA status messages
        if (signal.source === "ra") {
          // Only show "Not mapped" if explicitly unmapped AND no data
          // If we have achievement data, render normally even if status is null
          const hasData = signal.earned != null || signal.total != null;
          
          if (signal.ra_status === "unmapped" || (!signal.ra_status && !hasData)) {
            return (
              <div
                key={signal.source}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fff",
                  minWidth: 180,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 800,
                    marginBottom: 6,
                  }}
                >
                  <span>{signal.label}</span>
                </div>
                <div style={{ fontSize: 14, color: "#64748b", opacity: 0.7 }}>
                  Not mapped
                </div>
              </div>
            );
          }
          if (signal.ra_status === "no_set") {
            return (
              <div
                key={signal.source}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: 12,
                  background: "#fff",
                  minWidth: 180,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: 800,
                    marginBottom: 6,
                  }}
                >
                  <span>{signal.label}</span>
                </div>
                <div style={{ fontSize: 14, color: "#64748b", opacity: 0.7 }}>
                  No set exists yet (community hasn't created one)
                </div>
                {signal.lastUpdatedAt && (
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                    Checked {new Date(signal.lastUpdatedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            );
          }
          // ra_status === "has_set" -> continue to normal rendering
        }

        const playtime = formatPlaytime(signal.playtimeMinutes);

        const pct =
          signal.progressPct != null
            ? Math.round(signal.progressPct)
            : signal.earned != null && signal.total
            ? Math.round((signal.earned / signal.total) * 100)
            : null;

        // Skip rendering if no data to show
        if (!playtime && signal.earned == null && pct == null) return null;

        return (
          <div
            key={signal.source}
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 12,
              background: "#fff",
              minWidth: 180,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontWeight: 800,
                marginBottom: 6,
              }}
            >
              <span>{signal.label}</span>
            </div>

            {playtime && (
              <div style={{ fontSize: 14, color: "#0f172a" }}>
                ⏱ {playtime}
              </div>
            )}

            {signal.earned != null && signal.total != null && (
              <div style={{ fontSize: 14, color: "#0f172a", marginTop: 2 }}>
                {signal.source === "ra" ? "👾" : "🏆"} {signal.earned} / {signal.total}
                {pct != null && ` (${pct}%)`}
              </div>
            )}

            {signal.lastUpdatedAt && (
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                Updated {new Date(signal.lastUpdatedAt).toLocaleDateString()}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
