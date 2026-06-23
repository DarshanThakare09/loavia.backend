import { PaginationMeta } from "../types/catalog.types";

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 100;

export function calculateSkip(page: number, limit: number): number {
  return (page - 1) * limit;
}

export function calculateMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    total,
    page,
    limit,
    totalPages,
  };
}

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function buildPagination(
  pageInput?: number | string | null,
  limitInput?: number | string | null
): PaginationParams {
  let page = Number(pageInput) || DEFAULT_PAGE;
  let limit = Number(limitInput) || DEFAULT_LIMIT;

  if (page < 1) page = DEFAULT_PAGE;
  if (limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const skip = calculateSkip(page, limit);

  return {
    page,
    limit,
    skip,
  };
}
