import { Router } from "express";
import * as controller from "../controllers/admin.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { validate } from "../middleware/validator";
import { UserRole } from "@prisma/client";
import {
  createCouponSchema,
  updateCouponSchema,
  reviewStatusUpdateSchema,
  userRoleUpdateSchema,
  userStatusUpdateSchema,
} from "../validators/admin.validator";

const router = Router();

// Globally require authentication for all routes
router.use(authenticate);

// --- Admin Self Profile ---
router.put(
  "/me/profile",
  requireRole([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.updateAdminProfile
);
router.post(
  "/me/change-password",
  requireRole([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.changeAdminPassword
);

// --- Dashboard & Analytics (Staff, Admin, Super Admin) ---
router.get(
  "/dashboard/summary",
  requireRole([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.getDashboardSummary
);
router.get(
  "/dashboard/sales-chart",
  requireRole([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.getSalesChart
);
router.get(
  "/dashboard/best-sellers",
  requireRole([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.getBestSellers
);
router.get(
  "/dashboard/category-sales",
  requireRole([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.getCategorySales
);

// --- Customer Management (Admin, Super Admin) ---
router.get(
  "/customers",
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.listCustomers
);
router.get(
  "/customers/:id",
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.getCustomerProfile
);
router.put(
  "/customers/:id/status",
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  validate({ body: userStatusUpdateSchema }),
  controller.updateCustomerStatus
);
router.put(
  "/customers/:id/role",
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  validate({ body: userRoleUpdateSchema }),
  controller.updateCustomerRole
);

// --- Coupon CRUD Management (Admin, Super Admin) ---
router.post(
  "/coupons",
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  validate({ body: createCouponSchema }),
  controller.createCoupon
);
router.get(
  "/coupons",
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.listCoupons
);
router.get(
  "/coupons/:id",
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.getCouponDetails
);
router.put(
  "/coupons/:id",
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  validate({ body: updateCouponSchema }),
  controller.updateCoupon
);
router.delete(
  "/coupons/:id",
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.deleteCoupon
);

// --- Review Moderation (Staff, Admin, Super Admin) ---
router.get(
  "/reviews",
  requireRole([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.listReviews
);
router.put(
  "/reviews/:id/status",
  requireRole([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  validate({ body: reviewStatusUpdateSchema }),
  controller.moderateReview
);

router.get(
  "/audit-logs",
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.listAuditLogs
);

// --- Contact Messages (Staff, Admin, Super Admin) ---
router.get(
  "/contact-messages",
  requireRole([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.listContactMessages
);

router.post(
  "/contact-messages/:id/respond",
  requireRole([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  controller.respondContactMessage
);

export default router;
