/**
 * Theme: CSS custom properties (semantic roles). Inject in :root / body.
 * Components use var(--color-*) only — no hex in component code.
 */

export const themeVars = `
  :root {
    --color-background: #ffffff;
    --color-background-muted: #f8fafc;
    --color-surface: #ffffff;
    --color-surface-hover: #f1f5f9;
    --color-text: #0f172a;
    --color-text-muted: #64748b;
    --color-text-inverse: #ffffff;
    --color-border: #e2e8f0;
    --color-border-strong: #cbd5e1;
    --color-interactive: #3b82f6;
    --color-interactive-hover: #2563eb;
    --color-interactive-active: #1d4ed8;
    --color-success: #22c55e;
    --color-warning: #eab308;
    --color-error: #ef4444;
    --color-info: #0ea5e9;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --color-background: #0a0a0a;
      --color-background-muted: #18181b;
      --color-surface: #18181b;
      --color-surface-hover: #27272a;
      --color-text: #fafafa;
      --color-text-muted: #a1a1aa;
      --color-text-inverse: #0f172a;
      --color-border: #27272a;
      --color-border-strong: #3f3f46;
      --color-interactive: #60a5fa;
      --color-interactive-hover: #93c5fd;
      --color-interactive-active: #3b82f6;
    }
  }
`;
