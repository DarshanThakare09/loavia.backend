import { Request, Response } from "express";
import { PaymentService } from "../services/payment.service";
import { OrderService } from "../services/order.service";
import { sendSuccess } from "../utils/apiResponse";
import { verifyPaymentSchema, retryPaymentSchema } from "../validators/payment.validator";
import { asyncHandler } from "../utils/asyncHandler";
import { BadRequestError } from "../errors/BadRequestError";
import { razorpay } from "../utils/razorpay";
import { OrderRepository } from "../repositories/order.repository";
import { OrderStatus } from "@prisma/client";

export class PaymentController {
  private paymentService = new PaymentService();
  private orderService = new OrderService();
  private orderRepository = new OrderRepository();

  // POST /api/v1/payments/verify
  verifyPayment = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    const ipAddress = req.ip;

    const validated = verifyPaymentSchema.parse(req.body);

    const result = await this.paymentService.processVerification(userId, validated, ipAddress);
    sendSuccess(res, result, "Payment verified and order confirmed successfully");
  });

  // POST /api/v1/payments/retry
  retryPayment = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.id;
    const { orderId } = retryPaymentSchema.parse(req.body);

    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new BadRequestError("Order not found");
    }

    if (order.userId !== userId) {
      throw new BadRequestError("You do not have permission to retry payment for this order");
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestError("Only pending orders can retry payment");
    }

    // Call Razorpay API to recreate a fresh gateway order ID
    let newGatewayOrderId = "";
    try {
      const razorpayOrder = await razorpay.orders.create({
        amount: order.totalAmount,
        currency: "INR",
        receipt: order.receiptNumber,
      });
      newGatewayOrderId = razorpayOrder.id;
    } catch (razorError) {
      throw new BadRequestError("Failed to regenerate payment session. Please try again.");
    }

    sendSuccess(
      res,
      {
        order: this.orderService.mapOrderVirtualStatus(order),
        razorpayOrderId: newGatewayOrderId,
        amount: order.totalAmount,
      },
      "Payment session regenerated successfully"
    );
  });

  // POST /api/v1/payments/webhook
  handleWebhook = asyncHandler(async (req: Request, res: Response) => {
    const signature = req.headers["x-razorpay-signature"] as string;
    if (!signature) {
      throw new BadRequestError("Webhook signature header is missing");
    }

    // Get the raw body buffer from req.rawBody cached in app.ts
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      throw new BadRequestError("Raw body is missing for webhook validation");
    }

    const rawBodyString = rawBody.toString("utf8");

    const result = await this.paymentService.processWebhook(signature, rawBodyString);
    sendSuccess(res, result, "Webhook processed successfully");
  });
}
