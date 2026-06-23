import { z } from "zod";

export const verifyPaymentSchema = z.object({
  orderId: z.string({ required_error: "Order ID is required" }).uuid("Invalid order ID format"),
  razorpayOrderId: z.string({ required_error: "Razorpay Order ID is required" }).min(1, "Razorpay Order ID is required"),
  razorpayPaymentId: z.string({ required_error: "Razorpay Payment ID is required" }).min(1, "Razorpay Payment ID is required"),
  razorpaySignature: z.string({ required_error: "Razorpay Signature is required" }).min(1, "Razorpay Signature is required"),
  method: z.string({ required_error: "Payment method is required" }).min(1, "Payment method is required"),
}).strict();

export const refundPaymentSchema = z.object({
  amount: z.number().int().positive("Refund amount must be a positive integer in Paise").optional(),
}).strict();

export const retryPaymentSchema = z.object({
  orderId: z.string({ required_error: "Order ID is required" }).uuid("Invalid order ID format"),
}).strict();
