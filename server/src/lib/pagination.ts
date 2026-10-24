import { z } from "zod";

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
  q: z.string().trim().max(120).optional(),
  sort: z.string().trim().max(60).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export function pageResult<T>(items: T[], total: number, page: number, limit: number): PageResult<T> {
  return { items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) };
}

export function offsetOf(page: number, limit: number): number {
  return (page - 1) * limit;
}
