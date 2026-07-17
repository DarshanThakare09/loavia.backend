import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authLimiter } from "../middleware/rateLimiter";

import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { UserRole } from "@prisma/client";

const router = Router();
const controller = new AuthController();

// Rate-limited Auth routes
router.post("/register", authLimiter, controller.register);
router.post("/login", authLimiter, controller.login);
router.post("/admin-login", authLimiter, controller.adminLogin);
router.post("/forgot-password", authLimiter, controller.forgotPassword);
router.post("/reset-password", authLimiter, controller.resetPassword);

// Standard Auth routes
router.post("/logout", controller.logout);
router.post("/admin-logout", controller.adminLogout);
router.post("/refresh", controller.refresh);
router.get("/verify-email", controller.verifyEmail);

// Verification and RBAC test routes
router.get("/me", authenticate, controller.getMe);
router.put("/profile", authenticate, controller.updateProfile);
router.post("/change-password", authenticate, controller.changePassword);
router.get("/admin-only", authenticate, requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]), controller.adminOnly);

export default router;
