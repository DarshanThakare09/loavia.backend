import { Request, Response } from "express";
import { CartService } from "../services/cart.service";
import { sendSuccess } from "../utils/apiResponse";
import { BadRequestError } from "../errors/BadRequestError";
import { asyncHandler } from "../utils/asyncHandler";

export class CartController {
  private cartService = new CartService();

  // Helper to extract session ID for guest carts
  private getSessionId(req: Request): string | undefined {
    const sessionId = (req.headers["x-session-id"] || req.query.sessionId || req.body.sessionId) as string | undefined;
    return sessionId;
  }

  // GET /api/v1/cart
  getCart = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const sessionId = this.getSessionId(req);

    if (!userId && !sessionId) {
      throw new BadRequestError("Authentication or guest session is required");
    }

    const cart = await this.cartService.getCart(userId, sessionId);
    sendSuccess(res, cart, "Cart retrieved successfully");
  });

  // POST /api/v1/cart/items
  addItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const sessionId = this.getSessionId(req);
    const ipAddress = req.ip;

    if (!userId && !sessionId) {
      throw new BadRequestError("Authentication or guest session is required");
    }

    const cart = await this.cartService.addItemToCart(req.body, userId, sessionId, ipAddress);
    sendSuccess(res, cart, "Item added to cart successfully", 200);
  });

  // PUT /api/v1/cart/items/:id
  updateItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const sessionId = this.getSessionId(req);
    const cartItemId = req.params.id;
    const { quantity } = req.body;
    const ipAddress = req.ip;

    if (!userId && !sessionId) {
      throw new BadRequestError("Authentication or guest session is required");
    }

    const cart = await this.cartService.updateCartItem(cartItemId, quantity, userId, sessionId, ipAddress);
    sendSuccess(res, cart, "Cart item updated successfully");
  });

  // DELETE /api/v1/cart/items/:id
  removeItem = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const sessionId = this.getSessionId(req);
    const cartItemId = req.params.id;
    const ipAddress = req.ip;

    if (!userId && !sessionId) {
      throw new BadRequestError("Authentication or guest session is required");
    }

    const cart = await this.cartService.removeCartItem(cartItemId, userId, sessionId, ipAddress);
    sendSuccess(res, cart, "Cart item removed successfully");
  });

  // DELETE /api/v1/cart
  clearCart = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const sessionId = this.getSessionId(req);

    if (!userId && !sessionId) {
      throw new BadRequestError("Authentication or guest session is required");
    }

    const cart = await this.cartService.clearCart(userId, sessionId);
    sendSuccess(res, cart, "Cart cleared successfully");
  });

  // POST /api/v1/cart/merge
  mergeCart = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const ipAddress = req.ip;

    if (!userId) {
      throw new BadRequestError("Authentication is required to merge carts");
    }

    const result = await this.cartService.mergeGuestCart(userId, req.body.items, ipAddress);
    sendSuccess(res, result, "Guest cart merged successfully");
  });
}
