import { prisma } from "../config/prisma";
import { Review, ReviewStatus, Prisma } from "@prisma/client";

export class ReviewRepository {
  // Create review
  async create(data: Prisma.ReviewUncheckedCreateInput): Promise<Review> {
    return prisma.review.create({
      data,
    });
  }

  // Find review by ID
  async findById(id: string): Promise<Review | null> {
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      return null;
    }
    return prisma.review.findUnique({
      where: { id },
      include: {
        product: true,
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  // Update review status (moderation)
  async updateStatus(id: string, status: ReviewStatus): Promise<Review> {
    return prisma.review.update({
      where: { id },
      data: { status },
    });
  }

  // List reviews (paginated, filterable)
  async findMany(
    skip = 0,
    take = 10,
    filters: { status?: ReviewStatus; productId?: string } = {}
  ): Promise<Review[]> {
    const where: Prisma.ReviewWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.productId) {
      where.productId = filters.productId;
    }

    return prisma.review.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  // Count reviews
  async count(filters: { status?: ReviewStatus; productId?: string } = {}): Promise<number> {
    const where: Prisma.ReviewWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.productId) {
      where.productId = filters.productId;
    }

    return prisma.review.count({ where });
  }

  // Calculate aggregate rating stats for a product
  async calculateProductRatingStats(productId: string): Promise<{ averageRating: number; reviewCount: number }> {
    const stats = await prisma.review.aggregate({
      where: {
        productId,
        status: ReviewStatus.APPROVED,
      },
      _avg: {
        rating: true,
      },
      _count: {
        id: true,
      },
    });

    return {
      averageRating: stats._avg.rating || 0.0,
      reviewCount: stats._count.id || 0,
    };
  }
}
