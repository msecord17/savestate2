# GameHome / Timeline on hosted vs local

## No feature flags

Searched for: `NODE_ENV`, `NEXT_PUBLIC_*` (feature toggles), `DEMO`, `production`, `Archivist`, `Eras`, `Timeline`, `enabled`, `feature`.

- **Nothing** gates Archivist, Eras, or Timeline by environment. Those sections are not dev-only.

## Why hosted can look “empty”

### 1. Identity summary never loads (most likely)

- GameHome gets **Archivist / Eras / top signals** from `identitySummary`, which is loaded by `fetchIdentitySummary()` → `GET /api/identity/summary` (see `web/src/core/api/identity.ts`).
- On failure the client gets the HTTP status (401, 500, etc.) and the strip shows **“Identity couldn’t load”** with a hint (see Quick debug below).
- When `identitySummary` stays `null`:
  - **IdentityStrip** shows that error chip instead of Archivist/Eras.
  - **EraTimeline** gets `eraBuckets = undefined` → empty or placeholder.
  - **TopSignalsRow** gets `detail = null` → no signals.

So on hosted you often get the “minimal shell” because the identity API fails, not because the feature is turned off.

**What to do**

- **Vercel env (required for identity + timeline):** `.env.local` is **not** deployed. In **Vercel → Project → Settings → Environment Variables** add the same vars you have locally, at least:
  - `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` — anon/public key (used by `supabaseRouteClient()` for auth)
  - `SUPABASE_SERVICE_ROLE_KEY` — service role key (used by `supabaseServer` for RPCs: `get_identity_signals`, `get_origin_timeline`, etc.)
- If you use a different origin for API (e.g. `NEXT_PUBLIC_BASE_URL`), set that for Production (and Preview if needed).
- **Redeploy** after changing env vars.
- Confirm you’re **logged in on the hosted site** (same URL as the app). If you only ever logged in on localhost, the session cookie is for localhost — log in again on the deployed URL so cookies are for that domain.

### 2. Timeline link is missing on small viewports

- **Top nav** (GameHome, Timeline, Search, …) has `className="hidden ... md:block"` in `app/layout.tsx` → visible only from `md` and up.
- **BottomNav** (`src/ui/BottomNav.tsx`) only has: **Home, Portfolio, Profile, Lists** — it does **not** include **Timeline**.

So on **mobile/narrow screens** you don’t see a Timeline link at all on hosted (same as local). If you usually test on desktop locally but on a phone on hosted, that can look like “Timeline is missing on hosted.”

**What to do**

- **Timeline** has been added to `BottomNav` so it’s visible on mobile.
- Open `/timeline` directly on hosted (e.g. `https://your-app.vercel.app/timeline`) to confirm the page works.

### 3. Timeline page not in deployed tree (route missing on Vercel)

If the Timeline **route** doesn’t exist on hosted (404 on `/timeline`), common causes:

- `web/app/timeline/page.tsx` was never committed, or was committed in the wrong place (e.g. repo-root `app/` instead of `web/app/`).
- `.gitignore` is ignoring the folder (rare).
- Vercel **Root Directory** is wrong, so the build doesn’t see `web/`.

**Check that the page is committed**

From repo root:

```bash
git ls-tree -r HEAD --name-only | findstr /i "web/app/timeline"
```

- If this prints **`web/app/timeline/page.tsx`**, the page is in the committed tree and Vercel receives it (assuming Root Directory is correct).
- If it prints **nothing**, the route was never pushed; commit and push `web/app/timeline/page.tsx`.

**Vercel project settings**

- This repo’s **root is the monorepo** (e.g. `savestate2`), not `web`. The Next app lives in the **`web`** subdirectory (`web/app/`, `web/package.json`, etc.).
- In Vercel you must set **Root Directory** to **`web`**. If Root Directory is left blank (or wrong), Vercel builds from the repo root and won’t see `app/timeline/page.tsx`, so `/timeline` can 404.
- Set it in **Vercel → Project → Settings → General → Root Directory** to **`web`**, then redeploy.

**Verified (this repo):** `web/app/timeline/page.tsx` is present in `git ls-tree` and on disk under `web/app/timeline/`. So the route is in the repo; if `/timeline` 404s on hosted, set Root Directory to `web` and redeploy.

### 4. 404 on `/api/identity/summary` (or other identity API)

If the **API route** returns 404 on the deployed site (not 401/500), the request never reaches your handler. Common causes:

- **Root Directory is wrong**  
  Vercel must build from the `web` folder. If Root Directory is blank or wrong, `next build` runs from the repo root and there is no `app/api/` there (it’s under `web/app/api/`), so all `/api/*` routes can 404.

- **Check another API route**  
  On the deployed site, open:  
  `https://your-deployed-url.vercel.app/api/ping`  
  - If **ping also 404s**: the whole `app/api/` tree isn’t in the build → fix **Root Directory** to `web`, redeploy, and try again.  
  - If **ping returns `{"ok":true,"message":"pong"}`** but `/api/identity/summary` 404s: the build is from `web` but the identity route isn’t included (e.g. deploy is from an old branch). Redeploy from the branch that contains `web/app/api/identity/summary/route.ts`.

- **Redeploy**  
  After setting Root Directory to `web`, use **Redeploy** in Vercel (Deployments → ⋮ → Redeploy) so the new setting is used.

**Verified (this repo):** `web/app/api/identity/route.ts` (redirects to summary), `web/app/api/identity/summary/route.ts`, and `web/app/api/ping/route.ts` are in the committed tree. They should both exist in the build when Root Directory is `web`.

**Identity API route map:**
- `GET /api/identity` → 307 redirect to `/api/identity/summary`
- `GET /api/identity/summary` → identity summary (archetypes, era, signals)
- `GET /api/identity/timeline` → era timeline
- `GET /api/identity/share` → create share
- `GET /api/identity/share/[shareId]` → share by ID

## Quick debug on hosted

- **GameHome strip:** When the identity API fails, the strip now shows **“Identity couldn’t load”** with a hint:
  - **“Log in on this site”** → 401 (not logged in on this domain, or cookies not sent).
  - **“Server env or DB issue”** → 500 (missing env vars, RPC missing, or DB error; check Vercel function logs).
  - **“Error 4xx/5xx”** → other status.
- **Network tab:** Reload GameHome and inspect the request to `/api/identity/summary` (and `/api/identity/timeline` if you open the Timeline page). That confirms 401 vs 500 and response body.
- **Vercel logs:** If 500, open Vercel → Project → Deployments → latest → Functions and check the logs for the identity route to see the actual error (e.g. missing `SUPABASE_SERVICE_ROLE_KEY` or RPC not found).
