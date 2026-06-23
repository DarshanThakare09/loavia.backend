import { prisma } from "../config/prisma";
import { ProductVariant, Prisma } from "@prisma/client";

export class ProductVariantRepository {
  async create(data: Prisma.ProductVariantUncheckedCreateInput): Promise<ProductVariant> {
    return prisma.productVariant.create({ data });
  }

  async update(id: string, data: Prisma.ProductVariantUncheckedUpdateInput): Promise<ProductVariant> {
    return prisma.productVariant.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<ProductVariant> {
    return prisma.productVariant.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  }

  async findById(id: string): Promise<ProductVariant | null> {
    return prisma.productVariant.findUnique({
      where: { id },
      include: {
        inventory: true,
      },
    });
  }

  async findBySku(sku: string): Promise<ProductVariant | null> {
    return prisma.productVariant.findFirst({
      where: { sku, isDeleted: false },
      include: {
        inventory: true,
      },
    });
  }

  async findByProductId(productId: string): Promise<ProductVariant[]> {
    return prisma.productVariant.findMany({
      where: { productId, isDeleted: false },
      orderBy: { price: "asc" },
      include: {
        inventory: true,
      },
    });
  }
}
