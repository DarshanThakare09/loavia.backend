import { Router } from "express";
import { AdminInventoryController } from "../controllers/adminInventory.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { validate } from "../middleware/validator";
import { UserRole } from "@prisma/client";
import { restockInventorySchema, adjustInventorySchema } from "../validators/inventory.validator";

const router = Router();
const controller = new AdminInventoryController();

// Globally require authentication and staff/admin RBAC roles for all admin inventory routes
router.use(authenticate);
router.use(requireRole([UserRole.STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN]));

router.post("/restock", validate({ body: restockInventorySchema }), controller.restock);
router.post("/adjust", validate({ body: adjustInventorySchema }), controller.adjust);
router.get("/low-stock", controller.getLowStock);
router.get("/:variantId", controller.getInventoryByVariantId);

export default router;
