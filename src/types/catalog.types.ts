import { ProductStatus } from "@prisma/client";

export type ProductSortOption = "newest" | "oldest" | "price_asc" | "price_desc" | "rated" | "popular";

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface ProductFilterInput {
  search?: string;
  categoryId?: string;
  categorySlug?: string;
  collectionId?: string;
  collectionSlug?: string;
  tagSlug?: string;
  isFeatured?: boolean;
  isBestSeller?: boolean;
  isNewArrival?: boolean;
  minPrice?: number;
  maxPrice?: number;
  status?: ProductStatus;
  page?: number;
  limit?: number;
  sortBy?: ProductSortOption;
}

export interface CategoryFilterInput {
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export interface CollectionFilterInput {
  isActive?: boolean;
  page?: number;
  limit?: number;
}
