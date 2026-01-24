"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ProfileRow = {
  // Steam
  steam_id?: string | null;
  steam_connected_at?: string | null;
  steam_last_synced_at?: string | null;
  steam_last_sync_count?: number | null;

  // RA
  ra_username?: string | null;
  ra_connected_at?: string | null;
  ra_last_synced_at?: string | null;
  ra_last_sync_count?: number | null;

  // PSN
  psn_connected_at?: string | null;
  psn_last_synced_at?: string | null;
  psn_last_sync_count?: number | null;

  // Xbox
  xbox_xuid?: string | null;
  xbox_connected_at?: string | null;
  xbox_last_synced_at?: string | null;
  xbox_last_sync_count?: number | null;

  // Score v11
  gamer_score_v11?: number | null;
  gamer_score_v11_confidence?: number | null;
  gamer_score_v11_breakdown?: any;
  gamer_score_v11_updated_at?: string | null;
};

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [err, setErr] = useState("");

  async function load() {
    const res = await fetch("/api/profile/me", { cache: "no-store" });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) throw new Error(data?.error || `Failed (${res.status})`);

    setUser(data?.user ?? null);
    setProfile(data?.profile ?? null);
  }

  async function runScoreRecalc() {
    try {
      const res = await fetch("/api/score/v11", { cache: "no-store" });
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;

      if (!res.ok) {
        window.alert(`Score API error (${res.status}): ${data?.error || text}`);
        return;
      }

      // Refresh profile row so score fields update
      await load();
    } catch (e: any) {
      window.alert(`Score recalculation failed: ${e?.message || e}`);
    }
  }

  async function runSync(path: string, label: string) {
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { accept: "application/json" },
      });

      const text = await res.text();

      // If we got HTML (usually a redirect/login page), don't JSON.parse it
      if (text.trim().startsWith("<")) {
        window.alert(
          `${label} sync failed (${res.status}): Server returned HTML (likely auth/redirect).\n\n` +
            `Hit this endpoint in the browser to confirm:\n${path}`
        );
        return;
      }

      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        window.alert(`${label} sync failed (${res.status}): Non-JSON response:\n\n${text.slice(0, 200)}`);
        return;
      }

      if (!res.ok) {
        window.alert(`${label} sync failed (${res.status}): ${data?.error || text}`);
        return;
      }

      // Special handling for PSN sync (has nested structure)
      if (data?.trophy_groups) {
        window.alert(
          `${label} sync OK ✅\n\n` +
            `Played games: ${data.played?.total ?? 0} (${data.played?.imported ?? 0} new)\n` +
            `Trophy titles: ${data.trophies?.total ?? 0} (${data.trophies?.imported ?? 0} new)\n` +
            `Trophy groups: ${data.trophy_groups?.imported ?? 0} (from ${data.trophy_groups?.unique_titles ?? 0} titles)\n` +
            `Releases touched: ${data.releases_touched ?? 0}`
        );
      } else {
        window.alert(
          `${label} sync OK ✅\nImported: ${data?.imported ?? 0}\nUpdated: ${data?.updated ?? 0}\nTotal: ${data?.total ?? 0}`
        );
      }

      await load();
    } catch (e: any) {
      window.alert(`${label} sync error: ${e?.message || e}`);
    }
  }

  async function runPsnAutoStatus() {
    try {
      const res = await fetch("/api/psn/auto-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // keep raw text
      }

      if (!res.ok) {
        throw new Error(
          `Auto-status failed (${res.status}): ${data?.error || text || "Unknown error"}`
        );
      }

      alert(`✅ PSN Auto-status: updated ${data.updated}, skipped ${data.skipped}`);
      await load();
      return data;
    } catch (e: any) {
      // This will catch true network errors too
      alert(`Auto-status failed: ${e?.message || "Failed to fetch"}`);
      console.error("PSN auto-status error:", e);
      throw e;
    }
  }

  useEffect(() => {
    setLoading(true);
    setErr("");
    load()
      .catch((e: any) => setErr(e?.message || "Failed to load profile"))
      .finally(() => setLoading(false));
  }, []);

  const score = profile?.gamer_score_v11 ?? null;
  const conf = profile?.gamer_score_v11_confidence ?? null;
  const breakdown =
    typeof profile?.gamer_score_v11_breakdown === "string"
      ? (() => {
          try {
            return JSON.parse(profile!.gamer_score_v11_breakdown as any);
          } catch {
            return null;
          }
        })()
      : profile?.gamer_score_v11_breakdown ?? null;

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 10 }}>Profile</h1>
        <Link href="/gamehome" style={{ color: "#2563eb" }}>GameHome →</Link>
      </div>

      {loading && <div style={{ color: "#6b7280" }}>Loading…</div>}

      {!loading && err && (
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>{err}</div>
      )}

      {!loading && !user && (
        <div style={{ color: "#b91c1c" }}>
          You’re not logged in. Log in first, then connect platforms.
        </div>
      )}

      {!loading && user && (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 14,
            padding: 14,
            background: "white",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 6 }}>
            Signed in as {user.email ?? user.id}
          </div>

          {/* Gamer Score */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Gamer Score</div>

            {score != null ? (
              <div style={{ color: "#0f172a" }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>
                    {score}
                  </div>
                  {conf != null ? (
                    <div style={{ color: "#64748b", fontSize: 13 }}>
                      Confidence: {conf}/100
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={runScoreRecalc}
                    style={{
                      marginLeft: "auto",
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Recalculate
                  </button>
                </div>

                {/* Why */}
                {breakdown?.explain?.length ? (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontWeight: 900, marginBottom: 6, fontSize: 13 }}>
                      Why is my score this?
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {breakdown.explain.map((x: any, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            border: "1px solid #e5e7eb",
                            borderRadius: 12,
                            padding: 10,
                            background: "#f8fafc",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <div style={{ fontWeight: 900 }}>{x.label ?? "Component"}</div>
                            <div style={{ fontWeight: 900 }}>{x.points ?? 0}</div>
                          </div>
                          <div style={{ color: "#64748b", fontSize: 13, marginTop: 4 }}>
                            {x.detail ?? ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 8, color: "#64748b", fontSize: 13 }}>
                    Recalculate to generate a breakdown.
                  </div>
                )}
              </div>
            ) : (
              <div style={{ color: "#64748b", fontSize: 13 }}>
                No score yet. Connect platforms and recalculate.
              </div>
            )}
          </div>

          {/* Era Quiz */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Era History</div>
            <Link
              href="/era-onboarding"
              style={{
                display: "inline-block",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "white",
                fontWeight: 900,
                textDecoration: "none",
                color: "#0f172a",
              }}
            >
              Take Era Quiz →
            </Link>
            <div style={{ color: "#64748b", fontSize: 13, marginTop: 6 }}>
              90 seconds. Improves your Gamer Lifetime Score.
            </div>
          </div>

          {/* Steam */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Steam</div>

            {profile?.steam_id ? (
              <div style={{ color: "#0f172a" }}>
                Connected ✅{" "}
                <span style={{ color: "#64748b" }}>{profile.steam_id}</span>

                {profile?.steam_last_synced_at ? (
                  <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                    Last synced: {new Date(profile.steam_last_synced_at).toLocaleString()} •{" "}
                    {profile.steam_last_sync_count ?? 0} games
                  </div>
                ) : (
                  <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                    Not synced yet.
                  </div>
                )}

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/steam-sync" style={{ color: "#2563eb" }}>
                    Steam Sync →
                  </Link>
                  <button
                    type="button"
                    onClick={() => runSync("/api/sync/steam", "Steam")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Run Steam Sync
                  </button>
                </div>
              </div>
            ) : (
              <a
                href="/api/auth/steam/start"
                style={{
                  display: "inline-block",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "white",
                  fontWeight: 900,
                  textDecoration: "none",
                  color: "#0f172a",
                }}
              >
                Connect Steam
              </a>
            )}
          </div>

          {/* RetroAchievements */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>RetroAchievements</div>

            {profile?.ra_username ? (
              <div style={{ color: "#0f172a" }}>
                Connected ✅{" "}
                <span style={{ color: "#64748b" }}>{profile.ra_username}</span>

                {profile?.ra_last_synced_at ? (
                  <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                    Last synced: {new Date(profile.ra_last_synced_at).toLocaleString()} •{" "}
                    {profile.ra_last_sync_count ?? 0} titles
                  </div>
                ) : (
                  <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                    Not synced yet.
                  </div>
                )}

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/retroachievements-connect" style={{ color: "#2563eb" }}>
                    RA Settings →
                  </Link>
                  <button
                    type="button"
                    onClick={() => runSync("/api/sync/retroachievements", "RetroAchievements")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Run RA Sync
                  </button>
                </div>
              </div>
            ) : (
              <Link
                href="/retroachievements-connect"
                style={{
                  display: "inline-block",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "white",
                  fontWeight: 900,
                  textDecoration: "none",
                  color: "#0f172a",
                }}
              >
                Connect RetroAchievements
              </Link>
            )}
          </div>

          {/* PlayStation */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>PlayStation</div>

            {profile?.psn_connected_at ? (
              <div style={{ color: "#0f172a" }}>
                Connected ✅

                {profile?.psn_last_synced_at ? (
                  <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                    Last synced: {new Date(profile.psn_last_synced_at).toLocaleString()} •{" "}
                    {profile.psn_last_sync_count ?? 0} titles
                  </div>
                ) : (
                  <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                    Not synced yet.
                  </div>
                )}

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/playstation-connect" style={{ color: "#2563eb" }}>
                    PSN Settings →
                  </Link>
                  <button
                    type="button"
                    onClick={() => runSync("/api/sync/psn", "PlayStation")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Run PSN Sync
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/psn/map", { method: "POST" });
                        const text = await res.text();

                        let json: any = null;
                        try { json = text ? JSON.parse(text) : null; } catch {}

                        if (!res.ok) {
                          alert(`PSN map failed (${res.status}): ${json?.error || text || "unknown"}`);
                          return;
                        }

                        // Smart message when nothing needed mapping
                        const mapped = json?.mapped ?? 0;
                        const created = json?.created ?? 0;
                        const psn_unmapped = json?.debug?.psn_unmapped ?? 0;

                        if (mapped === 0 && created === 0 && psn_unmapped === 0) {
                          alert("✅ Already mapped — no work needed.");
                        } else {
                          alert(`✅ PSN map complete:\n\nMapped: ${mapped}\nCreated: ${created}\nSkipped: ${json?.skipped ?? 0}`);
                        }
                      } catch (e: any) {
                        alert(`❌ Failed to fetch /api/psn/map: ${e?.message || e}`);
                      }
                    }}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Map PSN Titles → Catalog
                  </button>
                  <button
                    type="button"
                    onClick={runPsnAutoStatus}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Auto-suggest statuses (PSN)
                  </button>
                </div>
              </div>
              
            ) : (
              <Link
                href="/playstation-connect"
                style={{
                  display: "inline-block",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "white",
                  fontWeight: 900,
                  textDecoration: "none",
                  color: "#0f172a",
                }}
              >
                Connect PlayStation
              </Link>
              
            )}
          </div>

          {/* Xbox */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Xbox</div>

            {profile?.xbox_connected_at || profile?.xbox_xuid ? (
              <div style={{ color: "#0f172a" }}>
                Connected ✅{" "}
                <span style={{ color: "#64748b" }}>
                  {profile?.xbox_xuid ? `xuid ${profile.xbox_xuid}` : ""}
                </span>

                {profile?.xbox_last_synced_at ? (
                  <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                    Last synced: {new Date(profile.xbox_last_synced_at).toLocaleString()} •{" "}
                    {profile.xbox_last_sync_count ?? 0} titles
                  </div>
                ) : (
                  <div style={{ color: "#64748b", marginTop: 6, fontSize: 13 }}>
                    Not synced yet.
                  </div>
                )}

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link href="/xbox-connect" style={{ color: "#2563eb" }}>
                    Xbox Settings →
                  </Link>
                  <button
                    type="button"
                    onClick={() => runSync("/api/sync/xbox", "Xbox")}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                  >
                    Run Xbox Sync
                  </button>
                </div>
              </div>
            ) : (
              <Link
                href="/xbox-connect"
                style={{
                  display: "inline-block",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #e5e7eb",
                  background: "white",
                  fontWeight: 900,
                  textDecoration: "none",
                  color: "#0f172a",
                }}
              >
                Connect Xbox
              </Link>
            )}
            <button
              type="button"
              onClick={async () => {
                const res = await fetch("/api/auth/xbox/disconnect", { method: "POST" });
                const text = await res.text();
                if (!res.ok) return alert(`Disconnect failed: ${text}`);
                alert("Xbox disconnected ✅");
                await load();
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Disconnect Xbox
            </button>
          </div>

          {/* Portfolio Actions */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Portfolio</div>
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch("/api/portfolio/auto-status", { method: "POST" });
                  const text = await res.text();
                  const data = text ? JSON.parse(text) : null;

                  if (!res.ok) {
                    alert(`Auto-status failed (${res.status}): ${data?.error || text}`);
                    return;
                  }

                  alert(
                    `Auto-status done ✅\n\nConsidered: ${data.considered}\nUpdated: ${data.applied}\nInserted: ${data.inserted}\n\n(Only upgrades entries still marked "owned")`
                  );

                  await load();
                } catch (e: any) {
                  alert(e?.message || "Auto-status failed");
                }
              }}
              style={{
                padding: "8px 12px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Auto-suggest statuses (PSN + Xbox)
            </button>
          </div>
        </div>
      )}
      
    </div>
  );
}
