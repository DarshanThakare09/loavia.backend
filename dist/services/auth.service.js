"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const user_repository_1 = require("../repositories/user.repository");
const session_repository_1 = require("../repositories/session.repository");
const verificationToken_repository_1 = require("../repositories/verificationToken.repository");
const auditLog_repository_1 = require("../repositories/auditLog.repository");
const email_service_1 = require("./email.service");
const crypto_1 = require("../utils/crypto");
const jwt_1 = require("../utils/jwt");
const token_1 = require("../utils/token");
const ConflictError_1 = require("../errors/ConflictError");
const BadRequestError_1 = require("../errors/BadRequestError");
const UnauthorizedError_1 = require("../errors/UnauthorizedError");
const client_1 = require("@prisma/client");
const logger_1 = require("../config/logger");
const prisma_1 = require("../config/prisma");
const userRepository = new user_repository_1.UserRepository();
const sessionRepository = new session_repository_1.SessionRepository();
const verificationTokenRepository = new verificationToken_repository_1.VerificationTokenRepository();
const auditLogRepository = new auditLog_repository_1.AuditLogRepository();
const emailService = new email_service_1.EmailService();
class AuthService {
    async register(data, ipAddress) {
        const existingUser = await userRepository.findByEmail(data.email);
        if (existingUser) {
            throw new ConflictError_1.ConflictError("Email address is already registered");
        }
        const hashedPassword = data.password ? await (0, crypto_1.hashPassword)(data.password) : null;
        const user = await userRepository.create({
            name: data.name,
            email: data.email,
            passwordHash: hashedPassword,
            phone: data.phone,
            isVerified: false,
        });
        // Generate Verification Token
        const plainToken = (0, token_1.generateRandomToken)();
        const tokenHash = (0, token_1.hashToken)(plainToken);
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await verificationTokenRepository.create(user.id, tokenHash, client_1.VerificationType.EMAIL_VERIFICATION, expiresAt);
        // Send Verification Email
        await emailService.sendVerificationEmail(user.email, user.name, plainToken);
        // Audit Log
        await auditLogRepository.create({
            userId: user.id,
            action: "REGISTER",
            entity: "User",
            entityId: user.id,
            details: { email: user.email },
            ipAddress,
        });
        const { passwordHash: _, ...userWithoutPassword } = user;
        return userWithoutPassword;
    }
    async login(data, ipAddress) {
        const user = await userRepository.findByEmail(data.email);
        if (!user) {
            throw new BadRequestError_1.BadRequestError("Invalid email or password");
        }
        if (!user.passwordHash || !data.password) {
            throw new BadRequestError_1.BadRequestError("Invalid email or password");
        }
        const isPasswordValid = await (0, crypto_1.comparePassword)(data.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new BadRequestError_1.BadRequestError("Invalid email or password");
        }
        if (!user.isVerified) {
            throw new BadRequestError_1.BadRequestError("Please verify your email address first");
        }
        // Generate Session
        const plainSessionToken = (0, token_1.generateRandomToken)();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const session = await sessionRepository.create(user.id, plainSessionToken, expiresAt);
        // Generate Tokens
        const accessToken = (0, jwt_1.generateAccessToken)({
            sub: user.id,
            role: user.role,
            name: user.name,
            tokenVersion: user.tokenVersion,
        });
        const refreshToken = (0, jwt_1.generateRefreshToken)({
            sub: user.id,
            sessionId: session.id,
        });
        // Audit Log
        await auditLogRepository.create({
            userId: user.id,
            action: "LOGIN",
            entity: "User",
            entityId: user.id,
            details: { sessionId: session.id },
            ipAddress,
        });
        const { passwordHash: _, ...userWithoutPassword } = user;
        return { accessToken, refreshToken, user: userWithoutPassword };
    }
    async logout(refreshToken, ipAddress) {
        try {
            const payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
            const session = await sessionRepository.findById(payload.sessionId);
            if (session) {
                await sessionRepository.invalidateSession(session.id);
                await auditLogRepository.create({
                    userId: session.userId,
                    action: "LOGOUT",
                    entity: "Session",
                    entityId: session.id,
                    details: { reason: "Standard user logout" },
                    ipAddress,
                });
            }
        }
        catch (error) {
            // Inward token verification failures should fail silently on logout but log warning
            logger_1.logger.warn(`Failed token verification during logout attempt: ${error}`);
        }
    }
    async refresh(refreshToken, ipAddress) {
        let payload;
        try {
            payload = (0, jwt_1.verifyRefreshToken)(refreshToken);
        }
        catch (error) {
            throw new UnauthorizedError_1.UnauthorizedError("Invalid or expired refresh token");
        }
        const session = await sessionRepository.findById(payload.sessionId);
        // RTR Breach: Reused or Revoked token refresh attempt
        if (!session || !session.isValid) {
            if (session) {
                // Invalidate all sessions for the breached user
                await sessionRepository.invalidateAllForUser(session.userId);
                await userRepository.incrementTokenVersion(session.userId);
                await auditLogRepository.create({
                    userId: session.userId,
                    action: "REFRESH_TOKEN_REUSE_BREACH",
                    entity: "User",
                    entityId: session.userId,
                    details: { sessionId: session.id, note: "Stale session refresh triggered full revocation" },
                    ipAddress,
                });
            }
            throw new UnauthorizedError_1.UnauthorizedError("Session has been compromised, please login again");
        }
        // Check expiration
        if (new Date() > session.expiresAt) {
            await sessionRepository.invalidateSession(session.id);
            throw new UnauthorizedError_1.UnauthorizedError("Refresh token has expired");
        }
        const user = await userRepository.findById(session.userId);
        if (!user) {
            throw new UnauthorizedError_1.UnauthorizedError("User no longer exists");
        }
        // Invalidate old session
        await sessionRepository.invalidateSession(session.id);
        // Create new rotated session
        const plainSessionToken = (0, token_1.generateRandomToken)();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        const newSession = await sessionRepository.create(user.id, plainSessionToken, expiresAt);
        // Generate rotated tokens
        const newAccessToken = (0, jwt_1.generateAccessToken)({
            sub: user.id,
            role: user.role,
            name: user.name,
            tokenVersion: user.tokenVersion,
        });
        const newRefreshToken = (0, jwt_1.generateRefreshToken)({
            sub: user.id,
            sessionId: newSession.id,
        });
        await auditLogRepository.create({
            userId: user.id,
            action: "TOKEN_REFRESH",
            entity: "Session",
            entityId: newSession.id,
            details: { oldSessionId: session.id },
            ipAddress,
        });
        return { accessToken: newAccessToken, refreshToken: newRefreshToken };
    }
    async verifyEmail(token, ipAddress) {
        const tokenHash = (0, token_1.hashToken)(token);
        const verificationRecord = await verificationTokenRepository.findByTokenHash(tokenHash);
        if (!verificationRecord ||
            verificationRecord.type !== client_1.VerificationType.EMAIL_VERIFICATION ||
            verificationRecord.usedAt !== null ||
            new Date() > verificationRecord.expiresAt) {
            throw new BadRequestError_1.BadRequestError("Invalid or expired verification link");
        }
        // Mark token as consumed
        await verificationTokenRepository.markUsed(verificationRecord.id);
        // Verify User & create LoyaltyPoints record
        await userRepository.update(verificationRecord.userId, {
            isVerified: true,
            emailVerifiedAt: new Date(),
        });
        // Create initial loyalty points ledger
        await prisma_1.prisma.$transaction(async (tx) => {
            const existingPoints = await tx.loyaltyPoints.findUnique({
                where: { userId: verificationRecord.userId },
            });
            if (!existingPoints) {
                await tx.loyaltyPoints.create({
                    data: {
                        userId: verificationRecord.userId,
                        points: 100, // 100 registration bonus points
                    },
                });
            }
        });
        await auditLogRepository.create({
            userId: verificationRecord.userId,
            action: "EMAIL_VERIFIED",
            entity: "User",
            entityId: verificationRecord.userId,
            details: { tokenId: verificationRecord.id },
            ipAddress,
        });
    }
    async forgotPassword(email, ipAddress) {
        const user = await userRepository.findByEmail(email);
        if (!user) {
            // Inward generic success return to prevent email enumeration
            logger_1.logger.info(`Forgot password requested for non-existent email: ${email}`);
            return;
        }
        // Invalidate existing reset tokens for the user
        await verificationTokenRepository.invalidateAllForUser(user.id, client_1.VerificationType.PASSWORD_RESET);
        // Create new reset token
        const plainToken = (0, token_1.generateRandomToken)();
        const tokenHash = (0, token_1.hashToken)(plainToken);
        const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1 hour
        await verificationTokenRepository.create(user.id, tokenHash, client_1.VerificationType.PASSWORD_RESET, expiresAt);
        // Dispatch link
        await emailService.sendPasswordResetEmail(user.email, user.name, plainToken);
        await auditLogRepository.create({
            userId: user.id,
            action: "PASSWORD_RESET_REQUESTED",
            entity: "User",
            entityId: user.id,
            details: {},
            ipAddress,
        });
    }
    async resetPassword(password, token, ipAddress) {
        const tokenHash = (0, token_1.hashToken)(token);
        const verificationRecord = await verificationTokenRepository.findByTokenHash(tokenHash);
        if (!verificationRecord ||
            verificationRecord.type !== client_1.VerificationType.PASSWORD_RESET ||
            verificationRecord.usedAt !== null ||
            new Date() > verificationRecord.expiresAt) {
            throw new BadRequestError_1.BadRequestError("Invalid or expired password reset link");
        }
        // Mark token used
        await verificationTokenRepository.markUsed(verificationRecord.id);
        // Hash new password
        const hashedPassword = await (0, crypto_1.hashPassword)(password);
        // Update User, increment tokenVersion (invalidates old access JWTs), invalidate all active sessions
        await userRepository.update(verificationRecord.userId, {
            passwordHash: hashedPassword,
        });
        await userRepository.incrementTokenVersion(verificationRecord.userId);
        await sessionRepository.invalidateAllForUser(verificationRecord.userId);
        await auditLogRepository.create({
            userId: verificationRecord.userId,
            action: "PASSWORD_RESET_COMPLETED",
            entity: "User",
            entityId: verificationRecord.userId,
            details: { tokenId: verificationRecord.id },
            ipAddress,
        });
    }
}
exports.AuthService = AuthService;
