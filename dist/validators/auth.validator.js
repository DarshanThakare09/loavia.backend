"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPasswordSchema = exports.forgotPasswordSchema = exports.verifyEmailSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, "Name must be at least 2 characters").max(100),
    email: zod_1.z.string().email("Invalid email address").max(255),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters").max(100),
    phone: zod_1.z.string().max(20).optional(),
}).strict();
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email address"),
    password: zod_1.z.string().min(1, "Password is required"),
}).strict();
exports.verifyEmailSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, "Verification token is required"),
}).strict();
exports.forgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email("Invalid email address"),
}).strict();
exports.resetPasswordSchema = zod_1.z.object({
    token: zod_1.z.string().min(1, "Reset token is required"),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters").max(100),
}).strict();
