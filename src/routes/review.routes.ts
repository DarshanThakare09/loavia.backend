import { Router, Request, Response, NextFunction } from "express";
import { submitReview, getApprovedReviews } from "../controllers/review.controller";
import { validate } from "../middleware/validator";
import { verifyAccessToken } from "../utils/jwt";
import { UserRepository } from "../repositories/user.repository";
import { asyncHandler } from "../utils/asyncHandler";
import { createReviewSchema } from "../validators/review.validator";

const router = Router();
const userRepository = new UserRepository();

// Optional authentication — logged-in users get their ID attached, guests proceed as-is
const optionalAuthenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies.access_token;
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const user = await userRepository.findById(payload.sub);
    if (user && payload.tokenVersion === user.tokenVersion) {
      req.user = { id: user.id, role: user.role };
    }
  } catch {
    // Ignore invalid tokens — treat as guest
  }
  next();
});

// GET /api/v1/reviews — get all approved reviews
router.get(
  "/reviews",
  getApprovedReviews
);

// POST /api/v1/reviews — submit a new review (guest or authenticated)
router.post(
  "/reviews",
  optionalAuthenticate,
  validate({ body: createReviewSchema }),
  submitReview
);

export default router;
