import { Router } from "express";
import { AdminOrderController } from "../controllers/adminOrder.controller";
import { validate } from "../middleware/validator";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { UserRole } from "@prisma/client";
import { orderStatusUpdateSchema } from "../validators/order.validator";
import { shipmentUpdateSchema } from "../validators/shipment.validator";

const router = Router();
const controller = new AdminOrderController();

// Administrative Order Operations
router.put(
  "/orders/:id/status",
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.STAFF, UserRole.SUPER_ADMIN]),
  validate({ body: orderStatusUpdateSchema as any }),
  controller.updateOrderStatus
);

router.post(
  "/orders/:id/tracking",
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.STAFF, UserRole.SUPER_ADMIN]),
  validate({ body: shipmentUpdateSchema as any }),
  controller.updateShipmentTracking
);

router.get(
  "/orders",
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.STAFF, UserRole.SUPER_ADMIN]),
  controller.getAllOrders
);

export default router;
