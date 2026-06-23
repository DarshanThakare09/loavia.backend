import { z } from "zod";

const customBoxSelectionSchema = z.object({
  variantId: z.string().uuid("Invalid selection variant ID format"),
  quantity: z.number().int().positive("Selection quantity must be a positive integer"),
});

export const addCartItemSchema = z.object({
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

export const updateCartItemSchema = z.object({
  quantity: z.number().int().positive("Quantity must be a positive integer"),
});

export const mergeCartSchema = z.object({
  items: z.array(
    z.object({
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
    })
  ),
});
