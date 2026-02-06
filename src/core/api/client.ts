/**
 * Base API client. All list endpoints return { items, next_cursor, has_more }.
 * No offset math in UI — use next_cursor for pagination.
 */

const getBase = (): string => {
  if (typeof window !== "undefined") return "";
  return process.env.NEXT_PUBLIC_BASE_URL ?? "";
};

export async function apiGet<T>(path: string, options?: RequestInit): Promise<T> {
  const base = getBase();
  const res = await fetch(`${base}${path}`, { cache: "no-store", ...options });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const base = getBase();
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

/** Standard list response. UI never does offset math. */
export type ListResponse<T> = {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
};
