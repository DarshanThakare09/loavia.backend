import { Request, Response } from "express";
import { WishlistService } from "../services/wishlist.service";
import { sendSuccess } from "../utils/apiResponse";
import { asyncHandler } from "../utils/asyncHandler";

export class WishlistController {
  private wishlistService = new WishlistService();

  // GET /api/v1/wishlist
  getWishlist = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const wishlist = await this.wishlistService.getWishlist(userId);
    sendSuccess(res, wishlist, "Wishlist retrieved successfully");
  });

  // POST /api/v1/wishlist/items
  addItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { productId } = req.body;
    const ipAddress = req.ip;

    const wishlistItem = await this.wishlistService.addToWishlist(userId, productId, ipAddress);
    sendSuccess(res, wishlistItem, "Item added to wishlist successfully", 200);
  });

  // DELETE /api/v1/wishlist/items/:id
  removeItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const productId = req.params.id; // Treat :id as the product ID
    const ipAddress = req.ip;

    const result = await this.wishlistService.removeFromWishlist(userId, productId, ipAddress);
    sendSuccess(res, result, "Item removed from wishlist successfully");
  });
}
