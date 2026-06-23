import { z } from "zod";
import { OrderStatus } from "@prisma/client";

const customBoxSelectionSchema = z.object({
  variantId: z.string().uuid("Invalid selection variant ID format"),
  quantity: z.number().int().positive("Selection quantity must be a positive integer"),
});

const guestItemSchema = z.object({
  variantId: z.string().uuid("Invalid variant ID format"),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
  isCustomBox: z.boolean().optional().default(false),
  customBoxSelections: z.array(customBoxSelectionSchema).optional(),
}).refine((data) => {
  if (data.isCustomBox && (!data.customBoxSelections || data.customBoxSelections.length === 0)) {
    return false;
  }
  return true;
}, {
  message: "customBoxSelections are required when isCustomBox is true",
  path: ["customBoxSelections"],
});

export const placeOrderSchema = z.object({
  addressId: z.string().uuid("Invalid address ID format").optional(),
  shippingAddress: z.object({
    recipientName: z.string().min(1, "Recipient name is required").max(100),
    street: z.string().min(1, "Street is required"),
    city: z.string().min(1, "City is required").max(100),
    state: z.string().min(1, "State is required").max(100),
    postalCode: z.string().min(1, "Postal code is required").max(20),
    country: z.string().max(100).default("India"),
    phone: z.string().min(1, "Phone number is required").max(20),
    email: z.string().email("Invalid email format").optional(), // Optional for auth users, required for guest checkouts
  }).optional(),
  couponCode: z.string().optional(),
  items: z.array(guestItemSchema).optional(),
}).refine((data) => {
  if (!data.addressId && !data.shippingAddress) {
    return false;
  }
  return true;
}, {
  message: "Either addressId or shippingAddress must be provided",
  path: ["addressId"],
});

export const orderStatusUpdateSchema = z.object({
  status: z.nativeEnum(OrderStatus, {
    errorMap: () => ({ message: "Invalid order status value" }),
  }),
});
