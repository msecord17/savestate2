# Core

Shared logic only. **Core must never import from `src/ui` or `app` or `components`.**

- **api/** — API client wrappers. All `fetch('/api/...')` calls go through here. UI never fetches directly.
- **domain/** — Archetype scoring, era scoring, insight generation, merge rules. No React, no UI.
- **types/** — Shared types and Zod schemas for API responses.
