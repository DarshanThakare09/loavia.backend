import { Router } from "express";
import { WishlistController } from "../controllers/wishlist.controller";
import { validate } from "../middleware/validator";
import { authenticate } from "../middleware/auth";
import { addWishlistItemSchema } from "../validators/wishlist.validator";

const router = Router();
const controller = new WishlistController();

// Wishlist Routes (strictly requires authentication)
router.get("/", authenticate, controller.getWishlist);
router.post("/items", authenticate, validate({ body: addWishlistItemSchema }), controller.addItem);
router.delete("/items/:id", authenticate, controller.removeItem);

export default router;
