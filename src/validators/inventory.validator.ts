import { z } from "zod";

export const restockInventorySchema = z.object({
  variantId: z.string().uuid("Invalid variant ID format"),
  quantity: z.number().int().positive("Restock quantity must be a positive integer"),
});

export const adjustInventorySchema = z.object({
  variantId: z.string().uuid("Invalid variant ID format"),
  quantity: z.number().int().refine((val) => val !== 0, {
    message: "Adjustment quantity cannot be zero",
  }),
  reason: z.string().min(3, "Reason must be at least 3 characters long"),
});

export const reserveInventorySchema = z.object({
  variantId: z.string().uuid("Invalid variant ID format"),
  quantity: z.number().int().positive("Reservation quantity must be a positive integer"),
  checkoutSessionId: z.string().min(1, "Checkout session ID is required"),
  ttlMinutes: z.number().int().positive().optional(),
});
