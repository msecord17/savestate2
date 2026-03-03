"use client";

import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

type AvailabilityResponse =
  | { ok: true; available: true }
  | { ok: true; available: false; reason?: string }
  | { ok: false; error: string };

function normalizeInput(s: string) {
  return s.trim();
}

export function UsernameSetting({
  initialUsername,
}: {
  initialUsername: string | null;
}) {
  const [username, setUsername] = useState(initialUsername ?? "");
  const [status, setStatus] = useState<
    "idle" | "typing" | "checking" | "available" | "taken" | "invalid" | "error"
  >("idle");
  const [message, setMessage] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const trimmed = useMemo(() => normalizeInput(username), [username]);
  const debounced = useDebouncedValue(trimmed, 500);

  const changed = (initialUsername ?? "") !== trimmed;

  useEffect(() => {
    if (!trimmed) {
      setStatus("idle");
      setMessage("");
      return;
    }

    if (trimmed !== debounced) {
      setStatus("typing");
      setMessage("");
      return;
    }

    let cancelled = false;

    async function run() {
      setStatus("checking");
      setMessage("");

      try {
        const res = await fetch(
          `/api/profile/username-availability?username=${encodeURIComponent(debounced)}`,
          { method: "GET" }
        );
        const body = (await res.json()) as AvailabilityResponse;
        if (cancelled) return;

        if ("ok" in body && body.ok === false) {
          setStatus("error");
          setMessage(body.error || "Error checking username");
          return;
        }

        if (body.available) {
          setStatus("available");
          setMessage("Available");
          return;
        }

        const reason = (body as any).reason ?? "Not available";
        if (
          reason === "Reserved" ||
          reason?.toLowerCase?.().includes("must be") ||
          reason?.toLowerCase?.().includes("cannot") ||
          reason?.toLowerCase?.().includes("invalid")
        ) {
          setStatus("invalid");
          setMessage(reason);
        } else {
          setStatus("taken");
          setMessage(reason);
        }
      } catch {
        if (cancelled) return;
        setStatus("error");
        setMessage("Network error");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [trimmed, debounced]);

  const canSave =
    trimmed.length > 0 && changed && status === "available" && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setMessage("");

    try {
      const res = await fetch("/api/profile/update-username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });

      const body = await res.json();

      if (!res.ok || body?.ok !== true) {
        setSaving(false);
        setStatus("error");
        setMessage(body?.error ?? "Failed to update username");
        return;
      }

      setSaving(false);
      setStatus("idle");
      setMessage("Saved!");

      // easiest way to keep UI consistent: refresh
      if (typeof window !== "undefined") window.location.reload();
    } catch (e: any) {
      setSaving(false);
      setStatus("error");
      setMessage(e?.message ?? "Failed to update username");
    }
  }

  const badge = (() => {
    switch (status) {
      case "checking":
        return <span className="text-xs text-white/50">Checking…</span>;
      case "available":
        return <span className="text-xs text-emerald-400">{message}</span>;
      case "taken":
        return <span className="text-xs text-rose-400">{message || "Taken"}</span>;
      case "invalid":
        return <span className="text-xs text-amber-400">{message}</span>;
      case "error":
        return <span className="text-xs text-rose-400">{message}</span>;
      case "typing":
      case "idle":
      default:
        return message ? <span className="text-xs text-white/50">{message}</span> : null;
    }
  })();

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">Username</div>
          <div className="text-xs text-white/50">
            Your public URL: <span className="text-white/70">/users/{trimmed || "username"}</span>
          </div>
        </div>
        {badge}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="yourname"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
        />
        <button
          type="button"
          disabled={!canSave}
          onClick={handleSave}
          className="rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed bg-sky-600 hover:bg-sky-500 text-white"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div className="mt-2 text-xs text-white/40">
        You can change this once every 30 days.
      </div>
    </div>
  );
}
