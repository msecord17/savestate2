"use client";

import { useEffect, useState } from "react";

type Check = {
  name: string;
  url: string;
  method?: "GET" | "POST";
  body?: unknown;
};

type Result = {
  ok: boolean;
  status?: number;
  error?: string;
  sample?: any;
  ms?: number;
};

// Hardcoded release_id for preview check (replace with a real id from your DB if needed)
const SAMPLE_RELEASE_ID = "00000000-0000-0000-0000-000000000001";

const CHECKS: Check[] = [
  { name: "users/me", url: "/api/users/me" },
  { name: "users/me/identity", url: "/api/users/me/identity" },
  { name: "users/me/connections", url: "/api/users/me/connections" },
  { name: "quiz/games", url: "/api/quiz/games?q=mario&limit=12" },
  { name: "quiz/preview", url: "/api/quiz/preview", method: "POST", body: {} },
  { name: "quiz/submit", url: "/api/quiz/submit", method: "POST", body: {} },
  { name: "quiz/session", url: "/api/quiz/session" },
];

function clip(obj: any) {
  if (!obj) return obj;
  // keep it readable
  const s = JSON.stringify(obj, null, 2);
  return s.length > 1400 ? s.slice(0, 1400) + "\n…(trimmed)" : s;
}

export default function ContractsPage() {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const next: Record<string, Result> = {};
    let releaseIdForQuiz = SAMPLE_RELEASE_ID;

    for (const c of CHECKS) {
      const t0 = performance.now();
      try {
        const opts: RequestInit = { cache: "no-store" };
        let body = c.body;
        if (c.method === "POST" && body !== undefined) {
          opts.method = "POST";
          opts.headers = { "Content-Type": "application/json" };
          if (c.name === "quiz/preview") {
            body = { items: [{ release_id: releaseIdForQuiz }] };
          } else if (c.name === "quiz/submit") {
            body = { release_ids: [releaseIdForQuiz], selections: [{ release_id: releaseIdForQuiz, intensity: "regular" }] };
          }
          opts.body = JSON.stringify(body);
        }
        const res = await fetch(c.url, opts);
        const ms = Math.round(performance.now() - t0);
        let json: any = null;
        try {
          json = await res.json();
        } catch {
          // non-json response
        }

        const ok = res.ok && (json?.ok === true || json?.ok === undefined); // allow ok-less payloads too
        next[c.name] = {
          ok,
          status: res.status,
          ms,
          sample: json,
          error: ok ? undefined : json?.error || res.statusText,
        };
        if (c.name === "quiz/games" && ok && Array.isArray(json?.items) && json.items.length > 0) {
          releaseIdForQuiz = json.items[0].release_id ?? releaseIdForQuiz;
        }
      } catch (e: any) {
        next[c.name] = { ok: false, error: e?.message ?? "Fetch failed" };
      }
    }

    setResults(next);
    setRunning(false);
  }

  useEffect(() => {
    run();
  }, []);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold">Contract Harness</h1>
            <p className="text-sm text-muted-foreground">
              Quick health check for UI contract endpoints.
            </p>
          </div>

          <button
            onClick={run}
            disabled={running}
            className="px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent/20 disabled:opacity-50"
          >
            {running ? "Running…" : "Re-run"}
          </button>
        </div>

        <div className="space-y-3">
          {CHECKS.map((c) => {
            const r = results[c.name];
            const badge = r
              ? r.ok
                ? "✅"
                : "❌"
              : "…";

            return (
              <div key={c.name} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{badge}</span>
                      <div className="font-mono text-sm">{c.url}</div>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">{c.name}</div>
                  </div>

                  {r && (
                    <div className="text-xs text-muted-foreground text-right">
                      <div>Status: {r.status ?? "—"}</div>
                      <div>Time: {r.ms ?? "—"}ms</div>
                    </div>
                  )}
                </div>

                {r?.error ? (
                  <div className="mt-3 text-sm text-red-300">
                    {r.error}
                  </div>
                ) : null}

                {r?.sample ? (
                  <pre className="mt-3 text-xs text-muted-foreground overflow-auto rounded-lg border border-border bg-card p-3">
                    {clip(r.sample)}
                  </pre>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
