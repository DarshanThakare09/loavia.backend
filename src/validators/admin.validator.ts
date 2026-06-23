import { z } from "zod";
import { CouponType, ReviewStatus, UserRole } from "@prisma/client";

export const createCouponSchema = z.object({
  code: z.string().min(1, "Coupon code is required").max(50, "Coupon code must be under 50 characters"),
  discountType: z.nativeEnum(CouponType, {
    errorMap: () => ({ message: "Invalid discount type. Must be PERCENTAGE or FIXED" }),
  }),
  value: z.number().int().positive("Discount value must be a positive integer"),
  minOrderValue: z.number().int().nonnegative("Minimum order value must be non-negative").default(0),
  maxDiscount: z.number().int().positive("Maximum discount must be positive").optional(),
  expiresAt: z.string().datetime("Invalid date format for expiresAt").refine((val) => {
    return new Date(val) > new Date();
  }, {
    message: "Expiry date must be in the future",
  }),
});

export const updateCouponSchema = createCouponSchema.partial().extend({
  active: z.boolean().optional(),
});

export const reviewStatusUpdateSchema = z.object({
  status: z.nativeEnum(ReviewStatus, {
    errorMap: () => ({ message: "Invalid review status. Must be PENDING, APPROVED, REJECTED, or HIDDEN" }),
  }),
});

export const userRoleUpdateSchema = z.object({
  role: z.nativeEnum(UserRole, {
    errorMap: () => ({ message: "Invalid user role" }),
  }),
});

export const userStatusUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"], {
    errorMap: () => ({ message: "Invalid status. Must be ACTIVE or SUSPENDED" }),
  }),
});
