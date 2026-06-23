import { prisma } from "../config/prisma";
import { Inventory } from "@prisma/client";

export class InventoryRepository {
  async updateStockQuantity(
    variantId: string,
    availableQty: number,
    status?: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK"
  ): Promise<Inventory> {
    return prisma.inventory.update({
      where: { variantId },
      data: {
        availableQty,
        ...(status ? { status } : {}),
      },
    });
  }

  async incrementStock(variantId: string, quantity: number): Promise<Inventory> {
    return prisma.inventory.update({
      where: { variantId },
      data: {
        availableQty: {
          increment: quantity,
        },
      },
    });
  }

  async decrementStock(variantId: string, quantity: number): Promise<Inventory> {
    return prisma.inventory.update({
      where: { variantId },
      data: {
        availableQty: {
          decrement: quantity,
        },
      },
    });
  }

  async findInventoryByVariantId(variantId: string): Promise<Inventory | null> {
    return prisma.inventory.findUnique({
      where: { variantId },
      include: {
        variant: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async findLowStock(skip = 0, take = 10): Promise<{ data: any[]; total: number }> {
    const totalResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*)::int as count FROM inventories WHERE available_qty <= low_stock_threshold
    `;
    const total = totalResult[0]?.count || 0;

    const data = await prisma.$queryRaw<any[]>`
      SELECT 
        i.id,
        i.variant_id as "variantId",
        i.available_qty as "availableQty",
        i.reserved_qty as "reservedQty",
        i.low_stock_threshold as "lowStockThreshold",
        i.status,
        i.created_at as "createdAt",
        i.updated_at as "updatedAt",
        v.name as "variantName",
        v.sku as "variantSku",
        p.name as "productName",
        p.id as "productId"
      FROM inventories i
      JOIN product_variants v ON i.variant_id = v.id
      JOIN products p ON v.product_id = p.id
      WHERE i.available_qty <= i.low_stock_threshold
      ORDER BY i.available_qty ASC
      LIMIT ${take} OFFSET ${skip}
    `;

    return { data, total };
  }
}
