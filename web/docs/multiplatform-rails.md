# Multi-platform rails (SaveState)

## Structure

- **src/core** — API clients, domain logic, shared types. Must never import from `src/ui`, `app`, or `components`. All `fetch('/api/...')` from UI goes through `src/core/api/*`.
- **src/design** — `tokens.ts` (semantic roles, touch target min 44px), `theme.ts` (CSS vars). Components use tokens, not hex.
- **src/ui** — Layout primitives (e.g. `BottomNav`, `TwoPane`). Can import from core and design.

## Pagination

Every list endpoint returns `{ items, next_cursor, has_more }`. UI never does offset math; pass `next_cursor` for the next page. GameHome API returns both `items` and `cards` for backward compatibility.

## Mobile

- Touch targets ≥ 44px (use `tokens.touchTargetMin`).
- No hover-only affordances; use `active:` or tap feedback.
- Single mobile nav: bottom nav on small viewports (`BottomNav`), top nav hidden on mobile (`md:block`).
- Main content has `pb-20` on mobile so it’s not hidden behind the bottom nav.

## Tablet

- **TwoPane** (`src/ui/TwoPane.tsx`): list left, detail right at `md:` breakpoint. Use for collection browsing.

## Acceptance checks

1. **GameHome with thumbs**: Tap targets ≥ 44px, bottom nav usable, no hover-only actions.
2. **Same screens on iPhone + Pixel + iPad**: Layout and nav work across viewports.
3. **No business logic in components**: Only in `src/core` (domain + API).
4. **No direct fetch in UI**: All API calls via `src/core/api/*` (GameHome uses `fetchGameHome`, `fetchInsightsArchetypes`).

## Cursor rule

`.cursor/rules/core-boundaries.mdc` enforces: Core never imports UI; no direct fetch in app/components for app APIs.
