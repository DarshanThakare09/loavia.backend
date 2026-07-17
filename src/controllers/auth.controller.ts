import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";
import { sendSuccess } from "../utils/apiResponse";
import { env } from "../config/env";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
} from "../validators/auth.validator";
import { hashPassword, comparePassword } from "../utils/crypto";
import { BadRequestError } from "../errors/BadRequestError";
import { asyncHandler } from "../utils/asyncHandler";

import { UserRepository } from "../repositories/user.repository";

const authService = new AuthService();
const userRepository = new UserRepository();

const COOKIE_OPTIONS_ACCESS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 15 * 60 * 1000, // 15 minutes
  path: "/",
};

const COOKIE_OPTIONS_REFRESH = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/api/v1/auth", // Restricted to auth routes (refresh/logout)
};

import { prisma } from "../config/prisma";
import { UserRole } from "@prisma/client";

export class AuthController {
  register = asyncHandler(async (req: Request, res: Response) => {
    const validatedBody = registerSchema.parse(req.body);
    const user = await authService.register(validatedBody, req.ipAddress);
    sendSuccess(res, user, "Registration successful. Please verify your email.", 201);
  });

  login = asyncHandler(async (req: Request, res: Response) => {
    const validatedBody = loginSchema.parse(req.body);
    const { accessToken, refreshToken, user } = await authService.login(validatedBody, req.ipAddress);

    // Set Cookies
    res.cookie("access_token", accessToken, COOKIE_OPTIONS_ACCESS);
    res.cookie("refresh_token", refreshToken, COOKIE_OPTIONS_REFRESH);

    sendSuccess(res, { user }, "Login successful");
  });

  // Admin-specific login — sets admin_access_token cookie, does NOT touch access_token
  // This ensures customer storefront sessions are never affected by admin logins.
  adminLogin = asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = loginSchema.parse(req.body);

    // Retrieve the single seeded admin in the database
    const admin = await prisma.user.findFirst({
      where: {
        role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }
      }
    });

    // Enforce that only the single admin account is validated
    if (!admin || admin.email.toLowerCase().trim() !== email.toLowerCase().trim() || !admin.passwordHash) {
      throw new BadRequestError("Invalid credentials");
    }

    const isPasswordValid = await comparePassword(password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new BadRequestError("Invalid credentials");
    }

    // Call service to perform normal login setup (session, JWT, audit log)
    const { accessToken, user } = await authService.login({ email, password }, req.ipAddress);

    // Only set the admin-scoped cookie (not access_token)
    res.cookie("admin_access_token", accessToken, COOKIE_OPTIONS_ACCESS);

    sendSuccess(res, { user }, "Admin login successful");
  });

  logout = asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refresh_token;

    if (refreshToken) {
      await authService.logout(refreshToken, req.ipAddress);
    }

    // Clear Cookies
    res.clearCookie("access_token", { ...COOKIE_OPTIONS_ACCESS, maxAge: 0 });
    res.clearCookie("refresh_token", { ...COOKIE_OPTIONS_REFRESH, maxAge: 0 });

    sendSuccess(res, null, "Logout successful");
  });

  adminLogout = asyncHandler(async (_req: Request, res: Response) => {
    res.clearCookie("admin_access_token", { ...COOKIE_OPTIONS_ACCESS, maxAge: 0 });
    sendSuccess(res, null, "Admin logout successful");
  });

  refresh = asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.cookies.refresh_token;
    
    // We pass the refresh token to service to rotate it
    const { accessToken, refreshToken: newRefreshToken } = await authService.refresh(
      refreshToken,
      req.ipAddress
    );

    // Set Rotated Cookies
    res.cookie("access_token", accessToken, COOKIE_OPTIONS_ACCESS);
    res.cookie("refresh_token", newRefreshToken, COOKIE_OPTIONS_REFRESH);

    sendSuccess(res, null, "Token refreshed successfully");
  });

  verifyEmail = asyncHandler(async (req: Request, res: Response) => {
    const validatedQuery = verifyEmailSchema.parse(req.query);
    await authService.verifyEmail(validatedQuery.token, req.ipAddress);
    sendSuccess(res, null, "Email verified successfully");
  });

  forgotPassword = asyncHandler(async (req: Request, res: Response) => {
    const validatedBody = forgotPasswordSchema.parse(req.body);
    await authService.forgotPassword(validatedBody.email, req.ipAddress);
    sendSuccess(res, null, "If the email is registered, a password reset link has been sent.");
  });

  resetPassword = asyncHandler(async (req: Request, res: Response) => {
    const validatedBody = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(validatedBody.password, validatedBody.token, req.ipAddress);
    sendSuccess(res, null, "Password has been reset successfully");
  });

  getMe = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user || !req.user.id) {
      sendSuccess(res, null, "No active session", 200);
      return;
    }
    const user = await userRepository.findById(req.user.id);
    if (!user) {
      sendSuccess(res, null, "User not found", 404);
      return;
    }
    const { passwordHash, ...userWithoutPassword } = user;
    sendSuccess(res, userWithoutPassword, "User profile retrieved successfully");
  });

  updateProfile = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.id) {
      sendSuccess(res, null, "Unauthorized", 401);
      return;
    }
    const validatedBody = updateProfileSchema.parse(req.body);
    const updated = await userRepository.update(req.user.id, validatedBody);
    const { passwordHash, ...userWithoutPassword } = updated;
    sendSuccess(res, userWithoutPassword, "Profile updated successfully");
  });

  changePassword = asyncHandler(async (req: Request, res: Response) => {
    if (!req.user?.id) {
      sendSuccess(res, null, "Unauthorized", 401);
      return;
    }
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const user = await userRepository.findById(req.user.id);
    if (!user) {
      sendSuccess(res, null, "User not found", 404);
      return;
    }
    const isValid = user.passwordHash
      ? await comparePassword(currentPassword, user.passwordHash)
      : false;
    if (!isValid) {
      throw new BadRequestError("Current password is incorrect");
    }
    const newHash = await hashPassword(newPassword);
    await userRepository.update(req.user.id, { passwordHash: newHash });
    sendSuccess(res, null, "Password changed successfully");
  });

  adminOnly = asyncHandler(async (_req: Request, res: Response) => {
    sendSuccess(res, { message: "Welcome Admin!" }, "Authorized");
  });
}
