import { Router } from "express";
import { getQueueStats, retryFailedJobs } from "../controllers/adminEmail.controller";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/rbac";
import { UserRole } from "@prisma/client";

const router = Router();

router.get(
  "/emails/queue",
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  getQueueStats
);

router.post(
  "/emails/retry",
  authenticate,
  requireRole([UserRole.ADMIN, UserRole.SUPER_ADMIN]),
  retryFailedJobs
);

export default router;
