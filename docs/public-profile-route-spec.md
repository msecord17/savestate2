# Public Profile Route – Implementation Spec

Use this spec to implement the `/u/[username]` public profile (route + API + security + Discord + caching).

---

## 1. Route + data contract

### Page route

- **Create:** `app/u/[username]/page.tsx`
- Public route: no auth required. Fetch from the API below and render the V1 public profile layout (hero, identity strip, score, eras, recent, share card).

### API route

- **Create:** `app/api/public/profile/[username]/route.ts`
- **Method:** GET
- **Auth:** None (public).

### Response shape (public-safe only)

Return JSON with **only** these fields. Do not add internal IDs or raw platform data.

```ts
// Example structure (adapt to your types)
{
  user: {
    username: string;
    display_name: string;
    avatar_url: string | null;
    discord_handle: string | null;  // e.g. "matt#1234" or modern Discord username
  };
  identity: {
    primary_archetype: string;       // e.g. "Completionist"
    strength: string;               // e.g. "Core" | "Strong" | "Emerging"
    secondary_archetypes: string[];  // e.g. ["Retro Dabbler", "Backlog Tamer"]
    dominant_era: string;           // e.g. "PS2 Era"
    platform_vibe: string;          // e.g. "PlayStation-first"
    lifetime_score: number | null;  // or "Beta" if unstable
  };
  eras: Array<{
    key: string;
    label: string;
    years: string;
    titles_count: number;
    standout_titles: Array<{
      release_id: string;
      title: string;
      cover_url: string | null;
      signal_hint?: string;
    }>;
  }>;
  recent: Array<{
    release_id: string;
    title: string;
    cover_url: string | null;
    signal_hint: string;  // e.g. "12h" or "85%"
  }>;
}
```

- **user:** Public identity only (username, display name, avatar, optional Discord).
- **identity:** Archetype, strength, secondary archetypes, dominant era, platform vibe, lifetime score (no raw signals).
- **eras:** 5–7 eras max; each has key, label, years, **titles_count** (distinct games), and standout_titles (3–6 per era). No “games vs releases” jargon in the UI.
- **recent:** Up to 6 items with release_id, title, cover_url, and a short signal_hint (hours or %).

---

## 2. Security rules

- **Never expose** raw platform IDs in the public API or page: no `npCommunicationId`, `title_id`, `steam_appid`, etc. in the response or client-rendered data.
- **Never expose** full trophy/achievement lists publicly. Only:
  - Aggregated counts (e.g. achievements earned, completion %),
  - Selected standout titles with minimal fields (release_id, title, cover_url, signal_hint).
- If a username does not exist or the profile is not public, return **404** (and do not leak existence).

---

## 3. Discord handle

- Add **discord_handle** to the public profile payload (nullable string).
- Source it from your user/profile store (wherever Discord is linked).
- On the public page hero:
  - Show Discord icon + handle (e.g. `matt#1234` or modern username).
  - Use subtle text color so it’s trust-building but not dominant.

---

## 4. Caching

- **Cache** the public profile API response for **5–15 minutes** (e.g. `Cache-Control` or Next.js `revalidate`).
- Optionally tag/invalidate cache when the user runs a sync (so next request gets fresh data).
- Goal: public pages are **fast and stable** without hitting the DB on every view.

---

## 5. Implementation checklist

- [ ] `app/u/[username]/page.tsx` – public page that calls the API and renders V1 layout.
- [ ] `app/api/public/profile/[username]/route.ts` – GET handler returning only the public contract above.
- [ ] Response includes `user`, `identity`, `eras`, `recent`; no raw platform IDs or full trophy/achievement lists.
- [ ] `discord_handle` in payload and in hero with Discord icon + subtle styling.
- [ ] Cache API response 5–15 min; consider invalidation on user sync.
- [ ] 404 for missing or non-public username; no existence leakage.

---

## 6. Why /u/matt shows nothing

The page shows "Profile not found" when **no row in `profiles`** has `username = 'matt'` (case-insensitive) **and** `profile_public = true`. New columns start as `NULL` / `false`, so you must enable the profile first.

**Option A – From the app (recommended)**  
1. Run the migration `sql/2026-02-06_public_profile_columns.sql` in Supabase (SQL Editor).  
2. Log in, go to **Profile**.  
3. In **Public profile**, set **Username** to `matt`, optionally **Display name** and **Discord handle**, check **Profile visible at /u/matt**, then **Save public profile**.  
4. Open `/u/matt` – the profile should load.

**Option B – One-off SQL**  
Run in Supabase (replace `YOUR_USER_ID` with your `auth.users.id` or use a `WHERE` on another column you know):

```sql
update public.profiles
set username = 'matt', display_name = 'Matt', profile_public = true
where user_id = 'YOUR_USER_ID';
```
