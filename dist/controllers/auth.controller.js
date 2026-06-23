"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const auth_service_1 = require("../services/auth.service");
const apiResponse_1 = require("../utils/apiResponse");
const env_1 = require("../config/env");
const auth_validator_1 = require("../validators/auth.validator");
const asyncHandler_1 = require("../utils/asyncHandler");
const authService = new auth_service_1.AuthService();
const COOKIE_OPTIONS_ACCESS = {
    httpOnly: true,
    secure: env_1.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 15 * 60 * 1000, // 15 minutes
    path: "/",
};
const COOKIE_OPTIONS_REFRESH = {
    httpOnly: true,
    secure: env_1.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/api/v1/auth", // Restricted to auth routes (refresh/logout)
};
class AuthController {
    register = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const validatedBody = auth_validator_1.registerSchema.parse(req.body);
        const user = await authService.register(validatedBody, req.ipAddress);
        (0, apiResponse_1.sendSuccess)(res, user, "Registration successful. Please verify your email.", 201);
    });
    login = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const validatedBody = auth_validator_1.loginSchema.parse(req.body);
        const { accessToken, refreshToken, user } = await authService.login(validatedBody, req.ipAddress);
        // Set Cookies
        res.cookie("access_token", accessToken, COOKIE_OPTIONS_ACCESS);
        res.cookie("refresh_token", refreshToken, COOKIE_OPTIONS_REFRESH);
        (0, apiResponse_1.sendSuccess)(res, { user }, "Login successful");
    });
    logout = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const refreshToken = req.cookies.refresh_token;
        if (refreshToken) {
            await authService.logout(refreshToken, req.ipAddress);
        }
        // Clear Cookies
        res.clearCookie("access_token", { ...COOKIE_OPTIONS_ACCESS, maxAge: 0 });
        res.clearCookie("refresh_token", { ...COOKIE_OPTIONS_REFRESH, maxAge: 0 });
        (0, apiResponse_1.sendSuccess)(res, null, "Logout successful");
    });
    refresh = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const refreshToken = req.cookies.refresh_token;
        // We pass the refresh token to service to rotate it
        const { accessToken, refreshToken: newRefreshToken } = await authService.refresh(refreshToken, req.ipAddress);
        // Set Rotated Cookies
        res.cookie("access_token", accessToken, COOKIE_OPTIONS_ACCESS);
        res.cookie("refresh_token", newRefreshToken, COOKIE_OPTIONS_REFRESH);
        (0, apiResponse_1.sendSuccess)(res, null, "Token refreshed successfully");
    });
    verifyEmail = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const validatedQuery = auth_validator_1.verifyEmailSchema.parse(req.query);
        await authService.verifyEmail(validatedQuery.token, req.ipAddress);
        (0, apiResponse_1.sendSuccess)(res, null, "Email verified successfully");
    });
    forgotPassword = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const validatedBody = auth_validator_1.forgotPasswordSchema.parse(req.body);
        await authService.forgotPassword(validatedBody.email, req.ipAddress);
        (0, apiResponse_1.sendSuccess)(res, null, "If the email is registered, a password reset link has been sent.");
    });
    resetPassword = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        const validatedBody = auth_validator_1.resetPasswordSchema.parse(req.body);
        await authService.resetPassword(validatedBody.password, validatedBody.token, req.ipAddress);
        (0, apiResponse_1.sendSuccess)(res, null, "Password has been reset successfully");
    });
    getMe = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
        (0, apiResponse_1.sendSuccess)(res, req.user, "User profile retrieved successfully");
    });
    adminOnly = (0, asyncHandler_1.asyncHandler)(async (_req, res) => {
        (0, apiResponse_1.sendSuccess)(res, { message: "Welcome Admin!" }, "Authorized");
    });
}
exports.AuthController = AuthController;
