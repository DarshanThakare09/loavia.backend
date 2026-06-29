import { z } from "zod";

export const createReviewSchema = z.object({
  productId: z.string().uuid("Invalid product ID").optional(),
  rating: z.number().int().min(1, "Rating must be at least 1").max(5, "Rating must be at most 5"),
  comment: z.string().min(5, "Review must be at least 5 characters").max(2000, "Review must be under 2000 characters"),
  // Guest reviewer info (used when user is not authenticated)
  guestName: z.string().min(2, "Name must be at least 2 characters").max(100).optional(),
  guestEmail: z.string().email("Invalid email address").optional(),
});

