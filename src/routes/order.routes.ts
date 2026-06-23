import { Router, Request, Response, NextFunction } from "express";
import { OrderController } from "../controllers/order.controller";
import { validate } from "../middleware/validator";
import { authenticate } from "../middleware/auth";
import { verifyAccessToken } from "../utils/jwt";
import { UserRepository } from "../repositories/user.repository";
import { asyncHandler } from "../utils/asyncHandler";
import { placeOrderSchema } from "../validators/order.validator";

const router = Router();
const controller = new OrderController();
const userRepository = new UserRepository();

// Optional authentication middleware for guest checkout support
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

// Checkout Pricing Validation
router.post("/checkout/validate", optionalAuthenticate, controller.validateCheckout);

// Customer Place & Manage Orders
router.post("/orders", optionalAuthenticate, validate({ body: placeOrderSchema as any }), controller.placeOrder);
router.get("/orders", authenticate, controller.getOrderHistory);
router.get("/orders/:id", authenticate, controller.getOrderDetails);
router.post("/orders/:id/cancel", authenticate, controller.cancelOrder);

export default router;
