import { z } from "zod";

/** Every list endpoint returns this shape. UI never uses offset. */
export const listResponseSchema = <T extends z.ZodType>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    next_cursor: z.string().nullable(),
    has_more: z.boolean(),
  });

export type ListResponse<T> = {
  items: T[];
  next_cursor: string | null;
  has_more: boolean;
};
