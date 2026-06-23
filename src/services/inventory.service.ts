import { InventoryRepository } from "../repositories/inventory.repository";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { NotFoundError } from "../errors/NotFoundError";
import { BadRequestError } from "../errors/BadRequestError";
import { resolveAuditUser } from "../utils/audit";
import { buildPagination, calculateMeta } from "../utils/pagination";
import { Inventory } from "@prisma/client";

const inventoryRepository = new InventoryRepository();

function calculateStatus(availableQty: number, lowStockThreshold: number): "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK" {
  if (availableQty <= 0) {
    return "OUT_OF_STOCK";
  }
  if (availableQty <= lowStockThreshold) {
    return "LOW_STOCK";
  }
  return "IN_STOCK";
}

async function getInventoryForUpdate(tx: any, variantId: string): Promise<Inventory | null> {
  const result = await tx.$queryRaw<any[]>`
    SELECT 
      id,
      variant_id as "variantId",
      available_qty as "availableQty",
      reserved_qty as "reservedQty",
      low_stock_threshold as "lowStockThreshold",
      status,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM inventories 
    WHERE variant_id = ${variantId}::uuid 
    FOR UPDATE
  `;
  return result[0] || null;
}

export class InventoryService {
  async restockInventory(
    variantId: string,
    quantity: number,
    actorId: string,
    ipAddress?: string | null
  ): Promise<Inventory> {
    if (quantity <= 0) {
      throw new BadRequestError("Restock quantity must be positive");
    }

    return prisma.$transaction(async (tx) => {
      const inventory = await getInventoryForUpdate(tx, variantId);
      if (!inventory) {
        throw new NotFoundError("Inventory record not found for variant");
      }

      const newQty = inventory.availableQty + quantity;
      const status = calculateStatus(newQty, inventory.lowStockThreshold);

      const updated = await tx.inventory.update({
        where: { variantId },
        data: {
          availableQty: newQty,
          status,
        },
      });

      // Mirror StockQuantity on ProductVariant
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          stockQuantity: newQty,
        },
      });

      // Audit Log
      const auditUser = resolveAuditUser(actorId);
      await tx.auditLog.create({
        data: {
          userId: auditUser.userId,
          action: "INVENTORY_RESTOCKED",
          entity: "Inventory",
          entityId: inventory.id,
          details: {
            variantId,
            quantity,
            oldQty: inventory.availableQty,
            newQty,
            ...auditUser.detailsExtra,
          },
          ipAddress,
        },
      });

      return updated;
    });
  }

  async adjustInventory(
    variantId: string,
    quantity: number,
    reason: string,
    actorId: string,
    ipAddress?: string | null
  ): Promise<Inventory> {
    if (quantity === 0) {
      throw new BadRequestError("Adjustment quantity cannot be zero");
    }
    if (!reason || reason.trim().length < 3) {
      throw new BadRequestError("A valid adjustment reason is required");
    }

    return prisma.$transaction(async (tx) => {
      const inventory = await getInventoryForUpdate(tx, variantId);
      if (!inventory) {
        throw new NotFoundError("Inventory record not found for variant");
      }

      const newQty = inventory.availableQty + quantity;
      if (newQty < 0) {
        throw new BadRequestError("Inventory cannot be adjusted below zero");
      }

      const status = calculateStatus(newQty, inventory.lowStockThreshold);

      const updated = await tx.inventory.update({
        where: { variantId },
        data: {
          availableQty: newQty,
          status,
        },
      });

      // Mirror StockQuantity on ProductVariant
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          stockQuantity: newQty,
        },
      });

      // Audit Log
      const auditUser = resolveAuditUser(actorId);
      await tx.auditLog.create({
        data: {
          userId: auditUser.userId,
          action: "INVENTORY_ADJUSTED",
          entity: "Inventory",
          entityId: inventory.id,
          details: {
            variantId,
            quantity,
            reason,
            oldQty: inventory.availableQty,
            newQty,
            ...auditUser.detailsExtra,
          },
          ipAddress,
        },
      });

      return updated;
    });
  }

  async reserveInventory(
    variantId: string,
    quantity: number,
    checkoutSessionId: string,
    actorId: string,
    ttlMinutes = 15,
    ipAddress?: string | null
  ): Promise<void> {
    if (quantity <= 0) {
      throw new BadRequestError("Reservation quantity must be positive");
    }
    if (!checkoutSessionId) {
      throw new BadRequestError("Checkout session ID is required");
    }

    await prisma.$transaction(async (tx) => {
      const inventory = await getInventoryForUpdate(tx, variantId);
      if (!inventory) {
        throw new NotFoundError("Inventory record not found for variant");
      }

      if (inventory.availableQty < quantity) {
        throw new BadRequestError("Insufficient stock available");
      }

      const newAvailable = inventory.availableQty - quantity;
      const newReserved = inventory.reservedQty + quantity;
      const status = calculateStatus(newAvailable, inventory.lowStockThreshold);

      await tx.inventory.update({
        where: { variantId },
        data: {
          availableQty: newAvailable,
          reservedQty: newReserved,
          status,
        },
      });

      // Mirror StockQuantity on ProductVariant
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          stockQuantity: newAvailable,
        },
      });

      // Audit Log
      const auditUser = resolveAuditUser(actorId);
      await tx.auditLog.create({
        data: {
          userId: auditUser.userId,
          action: "INVENTORY_RESERVED",
          entity: "Inventory",
          entityId: inventory.id,
          details: {
            variantId,
            quantity,
            checkoutSessionId,
            ...auditUser.detailsExtra,
          },
          ipAddress,
        },
      });
    });

    // Save mapping to Redis
    const redisKey = `stock_res:${checkoutSessionId}`;
    const ttlSeconds = ttlMinutes * 60;

    const existingData = await redis.get(redisKey);
    let reservations: Array<{ variantId: string; quantity: number }> = [];

    if (existingData) {
      reservations = JSON.parse(existingData);
    }

    // Check if variant already reserved in this session
    const matchIndex = reservations.findIndex((r) => r.variantId === variantId);
    if (matchIndex > -1) {
      reservations[matchIndex].quantity += quantity;
    } else {
      reservations.push({ variantId, quantity });
    }

    await redis.setEx(redisKey, ttlSeconds, JSON.stringify(reservations));
  }

  async releaseInventoryReservation(
    checkoutSessionId: string,
    actorId: string,
    ipAddress?: string | null
  ): Promise<void> {
    if (!checkoutSessionId) {
      throw new BadRequestError("Checkout session ID is required");
    }

    const redisKey = `stock_res:${checkoutSessionId}`;
    const dataStr = await redis.get(redisKey);
    if (!dataStr) {
      throw new NotFoundError("No active reservations found for this checkout session");
    }

    const reservations: Array<{ variantId: string; quantity: number }> = JSON.parse(dataStr);

    await prisma.$transaction(async (tx) => {
      for (const item of reservations) {
        const inventory = await getInventoryForUpdate(tx, item.variantId);
        if (!inventory) continue;

        const newAvailable = inventory.availableQty + item.quantity;
        const newReserved = Math.max(0, inventory.reservedQty - item.quantity);
        const status = calculateStatus(newAvailable, inventory.lowStockThreshold);

        await tx.inventory.update({
          where: { variantId: item.variantId },
          data: {
            availableQty: newAvailable,
            reservedQty: newReserved,
            status,
          },
        });

        // Mirror StockQuantity
        await tx.productVariant.update({
          where: { id: item.variantId },
          data: {
            stockQuantity: newAvailable,
          },
        });

        // Audit Log
        const auditUser = resolveAuditUser(actorId);
        await tx.auditLog.create({
          data: {
            userId: auditUser.userId,
            action: "INVENTORY_RELEASED",
            entity: "Inventory",
            entityId: inventory.id,
            details: {
              variantId: item.variantId,
              quantity: item.quantity,
              checkoutSessionId,
              ...auditUser.detailsExtra,
            },
            ipAddress,
          },
        });
      }
    });

    await redis.del(redisKey);
  }

  async commitInventoryReservation(
    checkoutSessionId: string,
    actorId: string,
    ipAddress?: string | null
  ): Promise<void> {
    if (!checkoutSessionId) {
      throw new BadRequestError("Checkout session ID is required");
    }

    const redisKey = `stock_res:${checkoutSessionId}`;
    const dataStr = await redis.get(redisKey);
    if (!dataStr) {
      throw new NotFoundError("No active reservations found for this checkout session");
    }

    const reservations: Array<{ variantId: string; quantity: number }> = JSON.parse(dataStr);

    await prisma.$transaction(async (tx) => {
      for (const item of reservations) {
        const inventory = await getInventoryForUpdate(tx, item.variantId);
        if (!inventory) continue;

        const newReserved = Math.max(0, inventory.reservedQty - item.quantity);

        await tx.inventory.update({
          where: { variantId: item.variantId },
          data: {
            reservedQty: newReserved,
          },
        });

        // Audit Log
        const auditUser = resolveAuditUser(actorId);
        await tx.auditLog.create({
          data: {
            userId: auditUser.userId,
            action: "INVENTORY_COMMITTED",
            entity: "Inventory",
            entityId: inventory.id,
            details: {
              variantId: item.variantId,
              quantity: item.quantity,
              checkoutSessionId,
              ...auditUser.detailsExtra,
            },
            ipAddress,
          },
        });
      }
    });

    await redis.del(redisKey);
  }

  async getLowStockItems(pageInput?: number, limitInput?: number): Promise<{ data: any[]; total: number; meta: any }> {
    const { page, limit, skip } = buildPagination(pageInput, limitInput);
    const { data, total } = await inventoryRepository.findLowStock(skip, limit);
    const meta = calculateMeta(total, page, limit);

    return { data, total, meta };
  }

  async getInventoryByVariantId(variantId: string): Promise<Inventory> {
    if (!variantId) {
      throw new BadRequestError("Variant ID is required");
    }
    const inventory = await inventoryRepository.findInventoryByVariantId(variantId);
    if (!inventory) {
      throw new NotFoundError("Inventory record not found for variant");
    }
    return inventory;
  }
}
