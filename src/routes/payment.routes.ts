import { Router, Request, Response, NextFunction } from "express";
import { PaymentController } from "../controllers/payment.controller";
import { authenticate } from "../middleware/auth";
import { verifyAccessToken } from "../utils/jwt";
import { UserRepository } from "../repositories/user.repository";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();
const controller = new PaymentController();
const userRepository = new UserRepository();

// Optional authentication middleware to support both Guest and Customer payment completions
const optionalAuthenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies.access_token;
  if (!token) {
    return next();
  }
  try {
    const payload = verifyAccessToken(token);
    const user = await userRepository.findById(payload.sub);
    if (user && payload.tokenVersion === user.tokenVersion) {
      req.user = {
        id: user.id,
        role: user.role,
      };
    }
  } catch (error) {
    // Ignore and proceed as guest
  }
  next();
});

// Payment signature verification endpoint
router.post("/payments/verify", optionalAuthenticate, controller.verifyPayment);

// Payment retry session regeneration endpoint
router.post("/payments/retry", authenticate, controller.retryPayment);

// Public Razorpay webhook listener endpoint
router.post("/payments/webhook", controller.handleWebhook);

export default router;
