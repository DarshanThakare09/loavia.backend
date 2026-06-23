import { Request, Response } from "express";
import { InventoryService } from "../services/inventory.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

const inventoryService = new InventoryService();

export class AdminInventoryController {
  restock = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const { variantId, quantity } = req.body;

    const inventory = await inventoryService.restockInventory(
      variantId,
      quantity,
      actorId,
      req.ipAddress
    );

    sendSuccess(res, inventory, "Inventory restocked successfully", 200);
  });

  adjust = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const { variantId, quantity, reason } = req.body;

    const inventory = await inventoryService.adjustInventory(
      variantId,
      quantity,
      reason,
      actorId,
      req.ipAddress
    );

    sendSuccess(res, inventory, "Inventory adjusted successfully", 200);
  });

  getLowStock = asyncHandler(async (req: Request, res: Response) => {
    const page = req.query.page ? Number(req.query.page) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const result = await inventoryService.getLowStockItems(page, limit);

    sendSuccess(res, { items: result.data, meta: result.meta }, "Low stock items retrieved successfully", 200);
  });

  getInventoryByVariantId = asyncHandler(async (req: Request, res: Response) => {
    const { variantId } = req.params;

    const inventory = await inventoryService.getInventoryByVariantId(variantId);

    sendSuccess(res, inventory, "Inventory details retrieved successfully", 200);
  });
}
