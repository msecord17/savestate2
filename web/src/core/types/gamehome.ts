import { z } from "zod";

const cardSourceSchema = z.object({
  release_id: z.string().optional(),
  game_id: z.string().optional(),
  platforms: z.array(z.string()).optional(),
  platform_key: z.string().nullable().optional(),
  platform_name: z.string().nullable().optional(),
  platform_label: z.string().nullable().optional(),
  title: z.string(),
  cover_url: z.string().nullable(),
  status: z.string(),
  steam_playtime_minutes: z.number(),
  psn_playtime_minutes: z.number().nullable().optional(),
  psn_trophy_progress: z.number().nullable().optional(),
  psn_trophies_earned: z.number().nullable().optional(),
  psn_trophies_total: z.number().nullable().optional(),
  xbox_achievements_earned: z.number().nullable().optional(),
  xbox_achievements_total: z.number().nullable().optional(),
  xbox_gamerscore_earned: z.number().nullable().optional(),
  xbox_gamerscore_total: z.number().nullable().optional(),
  ra_achievements_earned: z.number().nullable().optional(),
  ra_achievements_total: z.number().nullable().optional(),
  sources: z.array(z.string()),
  lastSignalAt: z.string().nullable(),
  releases: z.array(z.any()).optional(),
});

/** Minimal shape for identity in gamehome response (one pipe). */
export type GameHomeIdentity = {
  primary_archetype: string;
  strength: string;
  primary_era: string;
  signals: Record<string, number>;
};

export const gamehomeResponseSchema = z.object({
  ok: z.literal(true).optional(),
  mode: z.string(),
  items: z.array(cardSourceSchema),
  next_cursor: z.string().nullable(),
  has_more: z.boolean(),
  identity: z.any().optional(),
  summary: z.any().optional(),
  drawer: z.any().optional(),
});

export type GameHomeCard = z.infer<typeof cardSourceSchema>;
export type GameHomeResponse = z.infer<typeof gamehomeResponseSchema>;
