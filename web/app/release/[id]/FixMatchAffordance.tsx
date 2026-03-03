"use client";

import React, { useEffect, useState } from "react";

type Props = {
  releaseId: string;
  igdbGameId: number | null;
};

export function FixMatchAffordance({ releaseId, igdbGameId }: Props) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [attachId, setAttachId] = useState("");
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/users/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setIsAdmin(!!d?.profile?.is_admin))
      .catch(() => setIsAdmin(false));
  }, []);

  if (!isAdmin) return null;

  async function markWrong() {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/releases/${releaseId}/igdb-mark-wrong`, {
        method: "POST",
      });
      const json = await res.json();
      if (json?.ok) {
        setMsg({ ok: true, text: "Match cleared. Refresh to see changes." });
        window.dispatchEvent(new CustomEvent("gh:release_refresh"));
      } else {
        setMsg({ ok: false, text: json?.error ?? "Failed" });
      }
    } catch {
      setMsg({ ok: false, text: "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  async function attach() {
    const id = attachId.trim();
    if (!id || !/^\d+$/.test(id)) {
      setMsg({ ok: false, text: "Enter a valid IGDB game ID" });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/releases/${releaseId}/igdb-attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ igdb_game_id: Number(id) }),
      });
      const json = await res.json();
      if (json?.ok) {
        setMsg({ ok: true, text: "Attached. Refresh to see changes." });
        setAttachId("");
        window.dispatchEvent(new CustomEvent("gh:release_refresh"));
      } else {
        setMsg({ ok: false, text: json?.error ?? "Failed" });
      }
    } catch {
      setMsg({ ok: false, text: "Request failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 pt-4 border-t border-[#222833]">
      <div className="text-xs text-[#A8B0BF] uppercase tracking-wide mb-2">
        Fix match
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {igdbGameId ? (
          <>
            <a
              href={`https://www.igdb.com/games/${igdbGameId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#7DD3FC] hover:underline"
            >
              IGDB #{igdbGameId}
            </a>
            <button
              type="button"
              disabled={loading}
              onClick={markWrong}
              className="px-2 py-1 rounded border border-amber-500/50 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 text-xs"
            >
              Mark wrong match
            </button>
          </>
        ) : null}
        <span className="flex items-center gap-2">
          <input
            type="text"
            placeholder="IGDB ID"
            value={attachId}
            onChange={(e) => setAttachId(e.target.value)}
            className="w-20 px-2 py-1 rounded bg-[#121826] border border-[#25304A] text-[#F1F5F9] text-xs"
          />
          <button
            type="button"
            disabled={loading}
            onClick={attach}
            className="px-2 py-1 rounded border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50 text-xs"
          >
            Attach
          </button>
        </span>
      </div>
      {msg ? (
        <p
          className={`mt-2 text-xs ${msg.ok ? "text-emerald-400" : "text-amber-400"}`}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
