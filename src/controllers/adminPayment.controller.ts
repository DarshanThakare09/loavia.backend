import { Request, Response } from "express";
import { PaymentService } from "../services/payment.service";
import { sendSuccess } from "../utils/apiResponse";
import { refundPaymentSchema } from "../validators/payment.validator";
import { asyncHandler } from "../utils/asyncHandler";
import { isRazorpayEnabled } from "../utils/razorpay";

export class AdminPaymentController {
  private paymentService = new PaymentService();

  // POST /api/v1/admin/payments/:id/refund
  refundOrder = asyncHandler(async (req: Request, res: Response) => {
    if (!isRazorpayEnabled) {
      res.status(503).json({ success: false, message: "Payment gateway is not configured — refunds are not available" });
      return;
    }
    const actorId = req.user!.id;
    const ipAddress = req.ip;
    const orderId = req.params.id;

    const validated = refundPaymentSchema.parse(req.body);

    const result = await this.paymentService.processRefund(
      orderId,
      validated.amount,
      actorId,
      ipAddress
    );

    sendSuccess(res, result, "Refund processed successfully");
  });
}
