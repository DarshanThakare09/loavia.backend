import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";

import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { UserRole } from "@prisma/client";

const router = Router();
const controller = new AuthController();

// Rate-limited Auth routes
router.post("/register", controller.register);
router.post("/login", controller.login);
router.post("/forgot-password", controller.forgotPassword);
router.post("/reset-password", controller.resetPassword);

// Standard Auth routes
router.post("/logout", controller.logout);
router.post("/refresh", controller.refresh);
router.get("/verify-email", controller.verifyEmail);

// Verification and RBAC test routes
router.get("/me", authenticate, controller.getMe);
router.get("/admin-only", authenticate, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]), controller.adminOnly);

export default router;
