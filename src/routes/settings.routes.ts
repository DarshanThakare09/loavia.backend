import { Router } from "express";
import { SettingsController } from "../controllers/settings.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { validate } from "../middleware/validator";
import { UserRole } from "@prisma/client";
import { updateSettingsSchema } from "../validators/settings.validator";

const router = Router();
const controller = new SettingsController();

// Public route to fetch settings
router.get("/settings", controller.getSettings);

// Admin-only route to update settings
router.put(
  "/admin/settings",
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  validate({ body: updateSettingsSchema }),
  controller.updateSettings
);

export default router;
