import { prisma } from "../config/prisma";
import { Coupon, Prisma } from "@prisma/client";

export class CouponRepository {
  // Find active, unexpired coupon by code
  async findByCode(code: string): Promise<Coupon | null> {
    const uppercaseCode = code.toUpperCase();
    return prisma.coupon.findFirst({
      where: {
        code: uppercaseCode,
        active: true,
        isDeleted: false,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  // Create new coupon
  async create(data: Prisma.CouponCreateInput): Promise<Coupon> {
    if (data.code) {
      data.code = data.code.toUpperCase();
    }
    return prisma.coupon.create({
      data,
    });
  }

  // Update existing coupon
  async update(id: string, data: Prisma.CouponUpdateInput): Promise<Coupon> {
    if (data.code && typeof data.code === "string") {
      data.code = data.code.toUpperCase();
    }
    return prisma.coupon.update({
      where: { id },
      data,
    });
  }

  // Find coupon by ID
  async findById(id: string): Promise<Coupon | null> {
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id)) {
      return null;
    }
    return prisma.coupon.findUnique({
      where: { id },
    });
  }

  // List coupons (paginated, filterable)
  async findMany(
    skip = 0,
    take = 10,
    filters: { active?: boolean; search?: string } = {}
  ): Promise<Coupon[]> {
    const where: Prisma.CouponWhereInput = { isDeleted: false };

    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    if (filters.search) {
      where.code = {
        contains: filters.search.toUpperCase(),
      };
    }

    return prisma.coupon.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
    });
  }

  // Count coupons (for pagination)
  async count(filters: { active?: boolean; search?: string } = {}): Promise<number> {
    const where: Prisma.CouponWhereInput = { isDeleted: false };

    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    if (filters.search) {
      where.code = {
        contains: filters.search.toUpperCase(),
      };
    }

    return prisma.coupon.count({ where });
  }

  // Soft delete coupon
  async softDelete(id: string): Promise<Coupon> {
    return prisma.coupon.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }
}
