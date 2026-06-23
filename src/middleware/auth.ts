import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { UserRepository } from "../repositories/user.repository";
import { UnauthorizedError } from "../errors/UnauthorizedError";
import { asyncHandler } from "../utils/asyncHandler";
import { AdminService } from "../services/admin.service";

const userRepository = new UserRepository();

export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = req.cookies.access_token;

  if (!token) {
    throw new UnauthorizedError("Access token is missing");
  }

  try {
    const payload = verifyAccessToken(token);

    // Fetch user from DB to verify active status and tokenVersion
    const user = await userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedError("User no longer exists");
    }

    // Check if tokenVersion matches
    if (payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedError("Token has been invalidated");
    }

    // Check if user is suspended in Redis
    const isSuspended = await AdminService.isCustomerSuspended(user.id);
    if (isSuspended) {
      throw new UnauthorizedError("Your account has been suspended");
    }

    // Attach user information to request
    req.user = {
      id: user.id,
      role: user.role,
    };

    next();
  } catch (error: any) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError("Invalid or expired access token");
  }
});
