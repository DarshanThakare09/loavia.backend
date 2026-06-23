import { z } from "zod";
import { ProductStatus } from "@prisma/client";

// Regex for slug verification (lowercase kebab-case)
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Regex for SKU verification (alphanumeric, hyphens, underscores)
const SKU_REGEX = /^[A-Z0-9\-_]+$/i;

// --- CATEGORY SCHEMA ---
export const createCategorySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: z.string().regex(SLUG_REGEX, "Slug must be lowercase kebab-case").max(100).optional(),
  parentId: z.string().uuid("Parent ID must be a valid UUID").optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  image: z.string().url("Image must be a valid URL").or(z.string().max(255)).optional().nullable(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  canonicalUrl: z.string().max(255).optional().nullable(),
}).strict();

export const updateCategorySchema = createCategorySchema.partial().strict();

// --- VARIANT SCHEMA ---
const variantBaseSchema = z.object({
  productId: z.string().uuid("Product ID must be a valid UUID").optional(),
  name: z.string().min(1, "Name must not be empty").max(100),
  sku: z.string().regex(SKU_REGEX, "SKU must contain only alphanumeric, hyphens, or underscores").min(3).max(100),
  price: z.number().int().nonnegative("Price in Paise must be non-negative"),
  discountPrice: z.number().int().nonnegative("Discount price in Paise must be non-negative").optional().nullable(),
  stockQuantity: z.number().int().nonnegative("Stock quantity must be non-negative").optional(),
  weight: z.number().int().nonnegative("Weight must be non-negative").optional().nullable(),
  isDefault: z.boolean().optional(),
  displayLabel: z.string().max(100).optional().nullable(),
}).strict();

export const createVariantSchema = variantBaseSchema.refine((data) => {
  if (data.discountPrice !== undefined && data.discountPrice !== null && data.discountPrice >= data.price) {
    return false;
  }
  return true;
}, {
  message: "Discount price must be less than the original price",
  path: ["discountPrice"],
});

export const updateVariantSchema = variantBaseSchema.partial().refine((data) => {
  if (
    data.discountPrice !== undefined &&
    data.discountPrice !== null &&
    data.price !== undefined &&
    data.discountPrice >= data.price
  ) {
    return false;
  }
  return true;
}, {
  message: "Discount price must be less than the original price",
  path: ["discountPrice"],
});

// --- IMAGE SCHEMA ---
export const createProductImageSchema = z.object({
  url: z.string().url("Url must be a valid URL").or(z.string().min(1)),
  altText: z.string().max(255).optional().nullable(),
  sortOrder: z.number().int().optional(),
  isPrimary: z.boolean().optional(),
  fileSize: z.number().int().nonnegative().optional().nullable(),
  mimeType: z.string().max(100).optional().nullable(),
}).strict();

// --- PRODUCT SCHEMA ---
export const createProductSchema = z.object({
  categoryId: z.string().uuid("Category ID must be a valid UUID"),
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  slug: z.string().regex(SLUG_REGEX, "Slug must be lowercase kebab-case").max(255).optional(),
  shortDescription: z.string().max(1000).optional().nullable(),
  description: z.string().min(10, "Description must be at least 10 characters"),
  ingredients: z.string().min(1, "Ingredients must not be empty"),
  calories: z.string().max(50).optional().nullable(),
  inStock: z.boolean().optional(),
  sku: z.string().regex(SKU_REGEX, "SKU must contain only alphanumeric, hyphens, or underscores").min(3).max(100),
  status: z.nativeEnum(ProductStatus).optional(),
  isFeatured: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  isNewArrival: z.boolean().optional(),
  featuredOrder: z.number().int().optional().nullable(),
  sortOrder: z.number().int().optional(),
  metaTitle: z.string().max(255).optional().nullable(),
  metaDescription: z.string().max(1000).optional().nullable(),
  ogImage: z.string().optional().nullable(),
  canonicalUrl: z.string().max(255).optional().nullable(),
  images: z.array(createProductImageSchema).optional(),
  variants: z.array(createVariantSchema).min(1, "At least one product variant is required"),
  tagIds: z.array(z.string().uuid()).optional(),
  collectionIds: z.array(z.string().uuid()).optional(),
}).strict();

export const updateProductSchema = createProductSchema.partial().omit({ variants: true }).extend({
  variants: z.array(createVariantSchema).optional(), // Can update without requiring variants
}).strict();

// --- COLLECTION SCHEMA ---
export const createCollectionSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  slug: z.string().regex(SLUG_REGEX, "Slug must be lowercase kebab-case").max(100).optional(),
  description: z.string().max(2000).optional().nullable(),
  bannerImage: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
  metaTitle: z.string().max(255).optional().nullable(),
  metaDescription: z.string().max(1000).optional().nullable(),
  canonicalUrl: z.string().max(255).optional().nullable(),
}).strict();

export const updateCollectionSchema = createCollectionSchema.partial().strict();
