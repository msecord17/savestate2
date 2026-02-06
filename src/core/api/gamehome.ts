import { apiGet } from "./client";
import type { GameHomeResponse, GameHomeCard } from "@/src/core/types/gamehome";
import type { IdentityPayload } from "@/lib/identity/types";

export type GameHomeMode = "game" | "release";

export type GameHomeData = {
  items: GameHomeCard[];
  next_cursor: string | null;
  has_more: boolean;
  /** When present, identity is computed; UI reads only from this (one pipe). */
  identityPayload?: IdentityPayload | null;
};

export async function fetchGameHome(
  mode: GameHomeMode,
  nextCursor: string | null
): Promise<GameHomeData> {
  const params = new URLSearchParams();
  params.set("mode", mode);
  if (nextCursor != null && nextCursor !== "") params.set("cursor", nextCursor);
  const url = `/api/gamehome?${params.toString()}`;
  const data = await apiGet<GameHomeResponse & { cards?: GameHomeCard[] }>(url);
  const items = data.items ?? data.cards ?? [];
  const identityPayload =
    data.identity != null && data.summary != null && data.drawer != null
      ? ({
          ok: true as const,
          summary: data.summary,
          drawer: data.drawer,
          identity: data.identity,
        } satisfies IdentityPayload)
      : undefined;
  return {
    items,
    next_cursor: data.next_cursor ?? null,
    has_more: data.has_more ?? false,
    identityPayload: identityPayload ?? null,
  };
}
