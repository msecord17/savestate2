"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DefaultRADeviceSettings from "@/components/settings/DefaultRADeviceSettings";

type MeResponse = {
  profile?: {
    username?: string | null;
    display_name?: string | null;
    discord_handle?: string | null;
    profile_public?: boolean | null;
    public_discord?: boolean | null;
  };
  error?: string;
};

type AvailabilityResponse =
  | { available: boolean; reason?: string }
  | { error: string };

function isValidUsername(u: string) {
  // keep in sync with your DB/check constraint rules
  // common: 3-20, alnum + underscore
  return /^[a-zA-Z0-9_]{3,20}$/.test(u);
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [meErr, setMeErr] = useState<string>("");

  const [username, setUsername] = useState("");
  const [initialUsername, setInitialUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [discordHandle, setDiscordHandle] = useState("");
  const [profilePublic, setProfilePublic] = useState(false);
  const [publicDiscord, setPublicDiscord] = useState(false);

  const [availStatus, setAvailStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid" | "error"
  >("idle");
  const [availMsg, setAvailMsg] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState<string>("");
  const [saveOk, setSaveOk] = useState<string>("");
  const [visibilitySaveErr, setVisibilitySaveErr] = useState<string>("");
  const [visibilitySaveOk, setVisibilitySaveOk] = useState<string>("");

  const debouncer = useRef<number | null>(null);

  const trimmed = useMemo(() => username.trim(), [username]);

  async function loadMe() {
    setLoading(true);
    setMeErr("");
    try {
      const res = await fetch("/api/profile/me", { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as MeResponse;

      if (!res.ok) {
        setMeErr(data?.error || `Failed to load (${res.status})`);
        return;
      }

      const p = data?.profile;
      const u = p?.username ?? "";
      setUsername(u);
      setInitialUsername(u);
      setDisplayName(p?.display_name ?? "");
      setDiscordHandle(p?.discord_handle ?? "");
      setProfilePublic(!!p?.profile_public);
      setPublicDiscord(!!p?.public_discord);
    } catch (e: any) {
      setMeErr(e?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  // Debounced availability check
  useEffect(() => {
    setSaveErr("");
    setSaveOk("");

    if (!trimmed) {
      setAvailStatus("idle");
      setAvailMsg("");
      return;
    }

    if (!isValidUsername(trimmed)) {
      setAvailStatus("invalid");
      setAvailMsg("3–20 chars. Letters, numbers, underscore.");
      return;
    }

    // If unchanged (case-insensitive), treat as available
    if (initialUsername && trimmed.toLowerCase() === initialUsername.toLowerCase()) {
      setAvailStatus("available");
      setAvailMsg("That's your current username.");
      return;
    }

    setAvailStatus("checking");
    setAvailMsg("Checking…");

    if (debouncer.current) window.clearTimeout(debouncer.current);

    debouncer.current = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/profile/username-availability?username=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" }
        );
        const data = (await res.json().catch(() => ({}))) as AvailabilityResponse;

        if (!res.ok) {
          setAvailStatus("error");
          setAvailMsg((data as any)?.error || `Check failed (${res.status})`);
          return;
        }

        const ok = (data as any)?.available === true;
        setAvailStatus(ok ? "available" : "taken");
        setAvailMsg(ok ? "Available." : ((data as any)?.reason || "Taken."));
      } catch (e: any) {
        setAvailStatus("error");
        setAvailMsg(e?.message || "Check failed");
      }
    }, 400);

    return () => {
      if (debouncer.current) window.clearTimeout(debouncer.current);
    };
  }, [trimmed, initialUsername]);

  async function saveUsername() {
    setSaving(true);
    setSaveErr("");
    setSaveOk("");

    const u = trimmed || null;

    if (u && !isValidUsername(u)) {
      setSaveErr("Invalid username format.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/profile/public", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: u }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSaveErr(data?.error || `Save failed (${res.status})`);
        return;
      }

      setSaveOk("Saved.");
      await loadMe();
    } catch (e: any) {
      setSaveErr(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <Link href={initialUsername ? `/users/${encodeURIComponent(initialUsername)}` : "/gamehome"} style={{ color: "#2563eb", fontWeight: 700 }}>
            {initialUsername ? "View Profile" : "GameHome"}
          </Link>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          Manage defaults and preferences for syncing + identity signals.
        </p>
      </div>

      {loading ? (
        <p style={{ marginTop: 12, color: "#64748b" }}>Loading…</p>
      ) : meErr ? (
        <p style={{ marginTop: 12, color: "#b91c1c" }}>{meErr}</p>
      ) : (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Public username</div>
          <p style={{ fontSize: 13, color: "#64748b", marginTop: 0 }}>
            Your public profile lives at{" "}
            <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 6 }}>
              /users/&lt;username&gt;
            </code>
          </p>

          <div style={{ maxWidth: 360, display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ fontSize: 13, fontWeight: 700 }}>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. Claudius17"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                }}
              />
            </label>

            <div style={{ fontSize: 13 }}>
              {availStatus === "checking" && <span style={{ color: "#64748b" }}>{availMsg}</span>}
              {availStatus === "available" && <span style={{ color: "#15803d" }}>{availMsg}</span>}
              {availStatus === "taken" && <span style={{ color: "#b91c1c" }}>{availMsg}</span>}
              {availStatus === "invalid" && <span style={{ color: "#b45309" }}>{availMsg}</span>}
              {availStatus === "error" && <span style={{ color: "#b91c1c" }}>{availMsg}</span>}
              {availStatus === "idle" && <span style={{ color: "#64748b" }}> </span>}
            </div>

            <button
              type="button"
              onClick={saveUsername}
              disabled={saving || availStatus === "checking" || availStatus === "taken" || availStatus === "invalid"}
              style={{
                marginTop: 6,
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #e5e7eb",
                background: "white",
                fontWeight: 900,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Saving…" : "Save username"}
            </button>

            {saveErr && <p style={{ color: "#b91c1c", fontSize: 13, margin: 0 }}>{saveErr}</p>}
            {saveOk && <p style={{ color: "#15803d", fontSize: 13, margin: 0 }}>{saveOk}</p>}

            {initialUsername ? (
              <p style={{ fontSize: 13, color: "#0f172a", marginTop: 6 }}>
                Your page:{" "}
                <a
                  href={`/users/${encodeURIComponent(initialUsername)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#2563eb", fontWeight: 800 }}
                >
                  /users/{initialUsername}
                </a>
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Privacy toggles */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontWeight: 900, marginBottom: 8 }}>Profile visibility</div>
        <p style={{ fontSize: 13, color: "#64748b", marginTop: 0, marginBottom: 12 }}>
          Control what others see on your public profile at /users/&lt;username&gt;.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={profilePublic}
              onChange={(e) => setProfilePublic(e.target.checked)}
            />
            <span>Profile visible (others can view your page)</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={publicDiscord}
              onChange={(e) => setPublicDiscord(e.target.checked)}
            />
            <span>Show Discord handle on public profile</span>
          </label>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            Display name (optional)
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Matt"
              style={{
                display: "block",
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                width: "100%",
                maxWidth: 320,
              }}
            />
          </label>
          <label style={{ fontSize: 13, fontWeight: 600 }}>
            Discord handle (optional)
            <input
              type="text"
              value={discordHandle}
              onChange={(e) => setDiscordHandle(e.target.value)}
              placeholder="e.g. matt#1234"
              style={{
                display: "block",
                marginTop: 4,
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                width: "100%",
                maxWidth: 320,
              }}
            />
          </label>
          <button
            type="button"
            onClick={async () => {
              setSaving(true);
              setVisibilitySaveErr("");
              setVisibilitySaveOk("");
              try {
                const res = await fetch("/api/profile/public", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    display_name: displayName.trim() || null,
                    discord_handle: discordHandle.trim() || null,
                    profile_public: profilePublic,
                    public_discord: publicDiscord,
                  }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) {
                  setVisibilitySaveErr(data?.error || `Save failed (${res.status})`);
                  return;
                }
                setVisibilitySaveOk("Visibility settings saved.");
                setTimeout(() => setVisibilitySaveOk(""), 2000);
              } catch (e: any) {
                setVisibilitySaveErr(e?.message ?? "Save failed");
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "white",
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              alignSelf: "flex-start",
            }}
          >
            {saving ? "Saving…" : "Save visibility"}
          </button>
          {visibilitySaveErr && <p style={{ color: "#b91c1c", fontSize: 13, margin: 0 }}>{visibilitySaveErr}</p>}
          {visibilitySaveOk && <p style={{ color: "#15803d", fontSize: 13, margin: 0 }}>{visibilitySaveOk}</p>}
        </div>
      </div>

      <DefaultRADeviceSettings />
    </div>
  );
}
