import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { sendSuccess } from "../utils/apiResponse";
import { ValidationError, ValidationErrorDetail } from "../errors/ValidationError";
import { NotFoundError } from "../errors/NotFoundError";
import { prisma } from "../config/prisma";
import { ProductStatus } from "@prisma/client";

// Helper to throw a single-field validation error
function validationFail(field: string, message: string): never {
  const details: ValidationErrorDetail[] = [{ field, message }];
  throw new ValidationError(details, message);
}

// POST /api/v1/reviews
// Public endpoint — allows authenticated users OR guests (by name + email) to submit a review.
// Reviews are stored as PENDING and appear in the admin moderation queue.
export const submitReview = asyncHandler(async (req: Request, res: Response) => {
  const { productId, rating, comment, guestName, guestEmail } = req.body;

  // ── Validate required fields ───────────────────────────────────────────────
  if (!rating || typeof rating !== "number" || rating < 1 || rating > 5) {
    validationFail("rating", "Rating must be a number between 1 and 5.");
  }
  if (!comment || typeof comment !== "string" || comment.trim().length < 5) {
    validationFail("comment", "Review text must be at least 5 characters.");
  }

  // ── Resolve the user ────────────────────────────────────────────────────────
  let userId: string;

  if (req.user?.id) {
    // Authenticated user — use their account
    userId = req.user.id;
  } else {
    // Guest user — need name + email to create/find a guest account
    if (!guestName || !guestEmail) {
      validationFail("guestEmail", "Please provide your name and email to submit a review.");
    }
    const emailTrimmed = (guestEmail as string).trim().toLowerCase();
    const nameTrimmed = (guestName as string).trim();

    // Upsert: find existing user by email or create a guest account (no password)
    const guestUser = await prisma.user.upsert({
      where: { email: emailTrimmed },
      update: {},  // Don't overwrite existing users' data
      create: {
        name: nameTrimmed,
        email: emailTrimmed,
        passwordHash: null,
        role: "CUSTOMER",
        isVerified: false,
      },
    });
    userId = guestUser.id;
  }

  // ── Resolve productId ───────────────────────────────────────────────────────
  // The Review table requires a productId FK. For general homepage reviews,
  // use the provided productId or fall back to the first available product.
  let resolvedProductId: string;

  if (productId && typeof productId === "string" && productId.trim().length > 0) {
    // Verify the product exists
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundError("The specified product does not exist.");
    }
    resolvedProductId = product.id;
  } else {
    // No product specified — link to the first active product as a general review
    const firstProduct = await prisma.product.findFirst({
      where: { status: ProductStatus.PUBLISHED },
      orderBy: { createdAt: "asc" },
    });
    if (!firstProduct) {
      throw new NotFoundError("No products available to link this review to.");
    }
    resolvedProductId = firstProduct.id;
  }

  // ── Create the review as PENDING ────────────────────────────────────────────
  const review = await prisma.review.create({
    data: {
      userId,
      productId: resolvedProductId,
      rating: Number(rating),
      comment: comment.trim(),
      status: "PENDING",
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      product: { select: { id: true, name: true, sku: true } },
    },
  });

  return sendSuccess(res, review, "Review submitted successfully and is pending moderation.", 201);
});

// GET /api/v1/reviews
// Public endpoint — retrieves all APPROVED reviews to display on the storefront.
export const getApprovedReviews = asyncHandler(async (_req: Request, res: Response) => {
  const reviews = await prisma.review.findMany({
    where: {
      status: "APPROVED",
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      product: { select: { id: true, name: true } },
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return sendSuccess(res, reviews, "Approved reviews retrieved successfully");
});

