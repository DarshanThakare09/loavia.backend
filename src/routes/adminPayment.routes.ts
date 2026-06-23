import { Router } from "express";
import { AdminPaymentController } from "../controllers/adminPayment.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { UserRole } from "@prisma/client";

const router = Router();
const controller = new AdminPaymentController();

// Administrative Refund trigger protected by ADMIN/SUPER_ADMIN roles
router.post(
  "/payments/:id/refund",
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.refundOrder
);

export default router;
