"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_controller_1 = require("../controllers/auth.controller");
const rateLimiter_1 = require("../middleware/rateLimiter");
const auth_1 = require("../middleware/auth");
const rbac_1 = require("../middleware/rbac");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const controller = new auth_controller_1.AuthController();
// Rate-limited Auth routes
router.post("/register", rateLimiter_1.authLimiter, controller.register);
router.post("/login", rateLimiter_1.authLimiter, controller.login);
router.post("/forgot-password", rateLimiter_1.authLimiter, controller.forgotPassword);
router.post("/reset-password", rateLimiter_1.authLimiter, controller.resetPassword);
// Standard Auth routes
router.post("/logout", controller.logout);
router.post("/refresh", controller.refresh);
router.get("/verify-email", controller.verifyEmail);
// Verification and RBAC test routes
router.get("/me", auth_1.authenticate, controller.getMe);
router.get("/admin-only", auth_1.authenticate, (0, rbac_1.requireRole)([client_1.UserRole.ADMIN, client_1.UserRole.SUPER_ADMIN]), controller.adminOnly);
exports.default = router;
