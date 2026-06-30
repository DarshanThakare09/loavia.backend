import { Request, Response } from "express";
import { OrderService } from "../services/order.service";
import { sendSuccess } from "../utils/apiResponse";
import { BadRequestError } from "../errors/BadRequestError";
import { asyncHandler } from "../utils/asyncHandler";
import { UserRole } from "@prisma/client";
import { prisma } from "../config/prisma";


export class OrderController {
  private orderService = new OrderService();

  // Helper to extract session ID for guests
  private getSessionId(req: Request): string | undefined {
    return (req.headers["x-session-id"] || req.query.sessionId || req.body.sessionId) as string | undefined;
  }

  // POST /api/v1/checkout/validate
  validateCheckout = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const { couponCode, items: guestItems } = req.body;

    let itemsToCalculate: any[] = [];

    if (guestItems && guestItems.length > 0) {
      // Validate guest/payload items input
      const variantIds = guestItems.map((i: any) => i.variantId);
      const dbVariants = await prisma.productVariant.findMany({
        where: { id: { in: variantIds }, isDeleted: false },
      });

      itemsToCalculate = guestItems.map((item: any) => {
        const v = dbVariants.find((dbV: any) => dbV.id === item.variantId);
        if (!v) {
          throw new BadRequestError(`Product variant ${item.variantId} is unavailable`);
        }
        return {
          price: v.discountPrice !== null ? v.discountPrice : v.price,
          quantity: item.quantity,
        };
      });
    } else if (userId) {
      // Load user DB cart as fallback
      const dbCart = await (this.orderService as any).cartRepository.findCartByUserId(userId);
      if (!dbCart || dbCart.items.length === 0) {
        throw new BadRequestError("Your cart is empty");
      }
      itemsToCalculate = dbCart.items.map((item: any) => ({
        price: item.variant.discountPrice !== null ? item.variant.discountPrice : item.variant.price,
        quantity: item.quantity,
      }));
    } else {
      throw new BadRequestError("No items provided for calculation");
    }

    const calculations = await this.orderService.calculateTotals(itemsToCalculate, couponCode);
    sendSuccess(res, calculations, "Checkout pricing calculated successfully");
  });

  // POST /api/v1/orders
  placeOrder = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const sessionId = this.getSessionId(req);
    const ipAddress = req.ip;

    const { couponCode, shippingAddress, addressId, items: guestItems, customGiftNote } = req.body;

    const order = await this.orderService.placeOrder(
      userId,
      sessionId,
      couponCode,
      shippingAddress,
      addressId,
      guestItems,
      ipAddress,
      customGiftNote
    );

    sendSuccess(res, order, "Order placed successfully", 201);
  });

  // GET /api/v1/orders/:id
  getOrderDetails = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const role = req.user!.role as UserRole;
    const orderId = req.params.id;

    const order = await this.orderService.getOrder(orderId, userId, role);
    sendSuccess(res, order, "Order details retrieved successfully");
  });

  // GET /api/v1/orders
  getOrderHistory = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const page = parseInt(req.query.page as string || "1", 10);
    const limit = parseInt(req.query.limit as string || "10", 10);

    const history = await this.orderService.getOrderHistory(userId, page, limit);
    sendSuccess(res, history, "Order history retrieved successfully");
  });

  // POST /api/v1/orders/:id/cancel
  cancelOrder = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const role = req.user!.role as UserRole;
    const orderId = req.params.id;
    const ipAddress = req.ip;

    const order = await this.orderService.cancelOrder(orderId, userId, role, ipAddress);
    sendSuccess(res, order, "Order cancelled successfully");
  });

  // GET /api/v1/checkout/coupons
  getPublicCoupons = asyncHandler(async (_req: Request, res: Response) => {
    const coupons = await prisma.coupon.findMany({
      where: {
        active: true,
        isDeleted: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    sendSuccess(res, coupons, "Coupons retrieved successfully");
  });
}
