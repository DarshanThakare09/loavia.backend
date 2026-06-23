"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailService = void 0;
const logger_1 = require("../config/logger");
const env_1 = require("../config/env");
class EmailService {
    async sendVerificationEmail(email, name, token) {
        const verificationLink = `${env_1.env.FRONTEND_URL}/verify-email?token=${token}`;
        logger_1.logger.info(`📧 Sending verification email to ${email} (${name})`);
        logger_1.logger.info(`🔗 Verification Link: ${verificationLink}`);
        // In production, we would use the Resend SDK:
        // const resend = new Resend(env.RESEND_API_KEY);
        // await resend.emails.send({ ... });
    }
    async sendPasswordResetEmail(email, name, token) {
        const resetLink = `${env_1.env.FRONTEND_URL}/reset-password?token=${token}`;
        logger_1.logger.info(`📧 Sending password reset email to ${email} (${name})`);
        logger_1.logger.info(`🔗 Reset Link: ${resetLink}`);
    }
}
exports.EmailService = EmailService;
