import { Request, Response } from "express";
import { ShipmentService } from "../services/shipment.service";
import { OrderRepository } from "../repositories/order.repository";
import { sendSuccess } from "../utils/apiResponse";
import { NotFoundError } from "../errors/NotFoundError";
import { asyncHandler } from "../utils/asyncHandler";

export class ShipmentController {
  private shipmentService = new ShipmentService();
  private orderRepository = new OrderRepository();

  // GET /api/v1/orders/:id/tracking
  getTracking = asyncHandler(async (req: Request, res: Response) => {
    const orderIdOrReceipt = req.params.id;

    // Check if parameter is a valid UUID, otherwise check receipt number
    let order = await this.orderRepository.findById(orderIdOrReceipt);
    if (!order) {
      order = await this.orderRepository.findByReceipt(orderIdOrReceipt);
    }

    if (!order) {
      throw new NotFoundError("Order tracking details not found");
    }

    const tracking = await this.shipmentService.getTrackingHistory(order.receiptNumber);
    sendSuccess(res, tracking, "Tracking details retrieved successfully");
  });
}
