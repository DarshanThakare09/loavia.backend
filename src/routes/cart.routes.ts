import { Router, Request, Response, NextFunction } from "express";
import { CartController } from "../controllers/cart.controller";
import { validate } from "../middleware/validator";
import { authenticate } from "../middleware/auth";
import { verifyAccessToken } from "../utils/jwt";
import { UserRepository } from "../repositories/user.repository";
import { asyncHandler } from "../utils/asyncHandler";
import {
  addCartItemSchema,
  updateCartItemSchema,
  mergeCartSchema,
} from "../validators/cart.validator";

const router = Router();
const controller = new CartController();
const userRepository = new UserRepository();

// Optional authentication middleware for guest support
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
    // Ignore and continue as guest
  }
  next();
});

// Cart Routes supporting both Guests and Authenticated Users
router.get("/", optionalAuthenticate, controller.getCart);
router.post("/items", optionalAuthenticate, validate({ body: addCartItemSchema as any }), controller.addItem);
router.put("/items/:id", optionalAuthenticate, validate({ body: updateCartItemSchema as any }), controller.updateItem);
router.delete("/items/:id", optionalAuthenticate, controller.removeItem);
router.delete("/", optionalAuthenticate, controller.clearCart);

// Merge Guest Cart into User DB Cart (strictly requires authentication)
router.post("/merge", authenticate, validate({ body: mergeCartSchema as any }), controller.mergeCart);

export default router;
