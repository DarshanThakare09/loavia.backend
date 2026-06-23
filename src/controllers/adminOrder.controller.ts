import { Request, Response } from "express";
import { OrderService } from "../services/order.service";
import { ShipmentService } from "../services/shipment.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";
import { UserRole, ShipmentStatus } from "@prisma/client";

export class AdminOrderController {
  private orderService = new OrderService();
  private shipmentService = new ShipmentService();

  // PUT /api/v1/admin/orders/:id/status
  updateOrderStatus = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const actorRole = req.user!.role as UserRole;
    const orderId = req.params.id;
    const { status } = req.body;
    const ipAddress = req.ip;

    const order = await this.orderService.updateOrderStatus(orderId, status, actorId, actorRole, ipAddress);
    sendSuccess(res, order, "Order status updated successfully");
  });

  // POST /api/v1/admin/orders/:id/tracking
  updateShipmentTracking = asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user!.id;
    const orderId = req.params.id;
    const { trackingNumber, courierPartner, status } = req.body;
    const ipAddress = req.ip;

    const shipment = await this.shipmentService.updateShipment(
      orderId,
      trackingNumber,
      courierPartner,
      status as ShipmentStatus,
      actorId,
      ipAddress
    );

    sendSuccess(res, shipment, "Shipment tracking updated successfully");
  });

  // GET /api/v1/admin/orders
  getAllOrders = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query.page as string || "1", 10);
    const limit = parseInt(req.query.limit as string || "10", 10);

    const history = await this.orderService.getAllOrders(page, limit);
    sendSuccess(res, history, "Admin order listing retrieved successfully");
  });
}
