import { prisma } from "../config/prisma";
import { Product, Prisma } from "@prisma/client";
import { ProductFilterInput } from "../types/catalog.types";

export class ProductRepository {
  async create(data: Prisma.ProductCreateInput): Promise<Product> {
    return prisma.product.create({
      data,
      include: {
        images: true,
        variants: true,
        tags: true,
        collections: true,
      },
    });
  }

  async update(id: string, data: Prisma.ProductUpdateInput): Promise<Product> {
    return prisma.product.update({
      where: { id },
      data,
      include: {
        images: true,
        variants: true,
        tags: true,
        collections: true,
      },
    });
  }

  async delete(id: string): Promise<Product> {
    return prisma.product.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  async findById(id: string): Promise<Product | null> {
    return prisma.product.findFirst({
      where: { id, isDeleted: false },
      include: {
        category: true,
        images: {
          orderBy: { sortOrder: "asc" },
        },
        variants: {
          where: { isDeleted: false },
          orderBy: { price: "asc" },
        },
        tags: true,
        collections: true,
      },
    });
  }

  async findBySlug(slug: string): Promise<Product | null> {
    return prisma.product.findFirst({
      where: { slug, isDeleted: false },
      include: {
        category: true,
        images: {
          orderBy: { sortOrder: "asc" },
        },
        variants: {
          where: { isDeleted: false },
          orderBy: { price: "asc" },
        },
        tags: true,
        collections: true,
      },
    });
  }

  async findWithFilters(
    filters: ProductFilterInput,
    skip = 0,
    take = 10
  ): Promise<{ data: Product[]; total: number }> {
    const where: Prisma.ProductWhereInput = {
      isDeleted: false,
    };

    // Status filtering
    if (filters.status) {
      where.status = filters.status;
    }

    // Badge Filters
    if (filters.isFeatured !== undefined) {
      where.isFeatured = filters.isFeatured;
    }
    if (filters.isBestSeller !== undefined) {
      where.isBestSeller = filters.isBestSeller;
    }
    if (filters.isNewArrival !== undefined) {
      where.isNewArrival = filters.isNewArrival;
    }

    // Category Filters
    if (filters.categoryId) {
      where.categoryId = filters.categoryId;
    } else if (filters.categorySlug) {
      where.category = {
        slug: filters.categorySlug,
        isDeleted: false,
      };
    }

    // Collection Filters
    if (filters.collectionId) {
      where.collections = {
        some: {
          id: filters.collectionId,
        },
      };
    } else if (filters.collectionSlug) {
      where.collections = {
        some: {
          slug: filters.collectionSlug,
        },
      };
    }

    // Tag Filter
    if (filters.tagSlug) {
      where.tags = {
        some: {
          slug: filters.tagSlug,
        },
      };
    }

    // Price Range Filter (minPrice/maxPrice mapped to basePrice)
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      where.basePrice = {};
      if (filters.minPrice !== undefined) {
        where.basePrice.gte = filters.minPrice;
      }
      if (filters.maxPrice !== undefined) {
        where.basePrice.lte = filters.maxPrice;
      }
    }

    // Keyword Search (name, slug, description, shortDescription)
    if (filters.search) {
      const searchTerms = filters.search.trim();
      where.OR = [
        { name: { contains: searchTerms, mode: "insensitive" } },
        { slug: { contains: searchTerms, mode: "insensitive" } },
        { description: { contains: searchTerms, mode: "insensitive" } },
        { shortDescription: { contains: searchTerms, mode: "insensitive" } },
      ];
    }

    // Sorting
    let orderBy: Prisma.ProductOrderByWithRelationInput = { sortOrder: "asc" };

    if (filters.sortBy) {
      switch (filters.sortBy) {
        case "newest":
          orderBy = { createdAt: "desc" };
          break;
        case "oldest":
          orderBy = { createdAt: "asc" };
          break;
        case "price_asc":
          orderBy = { basePrice: "asc" };
          break;
        case "price_desc":
          orderBy = { basePrice: "desc" };
          break;
        case "rated":
          orderBy = { averageRating: "desc" };
          break;
        case "popular":
          orderBy = { isBestSeller: "desc" }; // resolves to bestseller priority ordering
          break;
        default:
          orderBy = { sortOrder: "asc" };
          break;
      }
    }

    const [data, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          category: true,
          images: {
            orderBy: { sortOrder: "asc" },
          },
          variants: {
            where: { isDeleted: false },
            orderBy: { price: "asc" },
          },
          tags: true,
          collections: true,
        },
      }),
      prisma.product.count({ where }),
    ]);

    return { data, total };
  }

  // Prepares the review integration rating update
  async updateProductRating(id: string, averageRating: number, reviewCount: number): Promise<Product> {
    return prisma.product.update({
      where: { id },
      data: {
        averageRating,
        reviewCount,
      },
    });
  }
}
