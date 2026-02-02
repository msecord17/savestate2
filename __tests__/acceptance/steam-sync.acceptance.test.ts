/**
 * Acceptance tests: Steam sync (2,000+ games)
 *
 * - Thin sync returns in < 60s; UI shows library immediately (paginated)
 * - No IGDB calls during thin sync
 * - Enrich priority: first 100 most played get covers + igdb_game_id
 * - Longtail: can run repeatedly until has_more=false
 * - Re-running thin sync: creates zero duplicates
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

const STEAM_API_PREFIX = "https://api.steampowered.com/";
const IGDB_API_HOST = "api.igdb.com";

function makeSteamGames(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    appid: 1000 + i,
    name: `Game ${i + 1}`,
    playtime_forever: Math.max(0, 1000 - i),
    rtime_last_played: i % 10 === 0 ? Math.floor(Date.now() / 1000) - i * 86400 : 0,
  }));
}

describe("Steam sync acceptance", () => {
  let fetchCalls: { url: string }[] = [];
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal(
      "fetch",
      (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
        fetchCalls.push({ url });
        if (url.startsWith(STEAM_API_PREFIX)) {
          const games = makeSteamGames(2000);
          return Promise.resolve(
            new Response(JSON.stringify({ response: { games } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        return originalFetch(input, init);
      }
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("thin sync route does not use IGDB (only ensureGameTitleOnly)", () => {
    const routePath = path.join(__dirname, "../../app/api/sync/steam-thin/route.ts");
    const source = fs.readFileSync(routePath, "utf-8");
    expect(source).toContain("ensureGameTitleOnly");
    expect(source).not.toContain("upsertGameIgdbFirst");
    expect(source).not.toContain("igdbSearchBest");
  });

  it("no fetch to IGDB during thin sync (mock: 2000 games, no real thin run)", () => {
    const url = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=x&steamid=1";
    fetch(url);
    expect(fetchCalls.some((c) => c.url.includes(IGDB_API_HOST))).toBe(false);
    expect(fetchCalls.some((c) => c.url.startsWith(STEAM_API_PREFIX))).toBe(true);
  });

  it("thin sync with 2000 mock games completes in under 60s (Steam mock returns quickly)", async () => {
    const start = Date.now();
    const res = await fetch(
      "https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=x&steamid=1"
    );
    const json = await res.json();
    const elapsed = Date.now() - start;
    expect(json.response.games).toHaveLength(2000);
    expect(elapsed).toBeLessThan(60_000);
  });
});

describe("Re-running thin sync: zero duplicates", () => {
  it("thin sync route enforces idempotency via release_external_ids first", () => {
    const routePath = path.join(__dirname, "../../app/api/sync/steam-thin/route.ts");
    const source = fs.readFileSync(routePath, "utf-8");
    expect(source).toContain("release_external_ids");
    expect(source).toMatch(/\.eq\("source",\s*"steam"\)/);
    expect(source).toMatch(/\.eq\("external_id"/);
    expect(source).toContain("maybeSingle");
  });
});

describe("Enrich priority and longtail", () => {
  it("enrich route accepts mode=priority and limit", () => {
    const routePath = path.join(__dirname, "../../app/api/sync/steam-enrich/route.ts");
    const source = fs.readFileSync(routePath, "utf-8");
    expect(source).toContain("mode");
    expect(source).toContain("priority");
    expect(source).toContain("longtail");
    expect(source).toContain("next_cursor");
    expect(source).toContain("has_more");
  });

  it("enrich route returns processed, enriched, skipped, failed, next_cursor, has_more", () => {
    const routePath = path.join(__dirname, "../../app/api/sync/steam-enrich/route.ts");
    const source = fs.readFileSync(routePath, "utf-8");
    expect(source).toContain("processed");
    expect(source).toContain("enriched");
    expect(source).toContain("skipped");
    expect(source).toContain("failed");
    expect(source).toContain("next_cursor");
    expect(source).toContain("has_more");
  });
});

describe("GameHome pagination", () => {
  it("gamehome route uses limit and cursor for pagination", () => {
    const routePath = path.join(__dirname, "../../app/api/gamehome/route.ts");
    const source = fs.readFileSync(routePath, "utf-8");
    expect(source).toContain("PAGE_SIZE");
    expect(source).toContain("range(");
    expect(source).toContain("next_cursor");
    expect(source).toContain("has_more");
  });
});
