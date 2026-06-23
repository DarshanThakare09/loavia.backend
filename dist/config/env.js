"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const zod_1 = require("zod");
// Load environment variables from .env file
dotenv_1.default.config();
const envSchema = zod_1.z.object({
    // SERVER CONFIGURATION
    PORT: zod_1.z.coerce.number().default(5000),
    NODE_ENV: zod_1.z.enum(["development", "production", "test"]).default("development"),
    FRONTEND_URL: zod_1.z.string().url().default("http://localhost:3000"),
    // DATABASE
    DATABASE_URL: zod_1.z.string().min(1, "DATABASE_URL is required"),
    // AUTH
    JWT_SECRET: zod_1.z.string().min(8, "JWT_SECRET must be at least 8 characters"),
    JWT_REFRESH_SECRET: zod_1.z.string().min(8, "JWT_REFRESH_SECRET must be at least 8 characters"),
    // CACHE
    REDIS_URL: zod_1.z.string().min(1, "REDIS_URL is required"),
    // EMAIL
    RESEND_API_KEY: zod_1.z.string().min(1, "RESEND_API_KEY is required"),
    // STORAGE
    CLOUDINARY_URL: zod_1.z.string().min(1, "CLOUDINARY_URL is required"),
    // PAYMENTS
    RAZORPAY_KEY_ID: zod_1.z.string().min(1, "RAZORPAY_KEY_ID is required"),
    RAZORPAY_KEY_SECRET: zod_1.z.string().min(1, "RAZORPAY_KEY_SECRET is required"),
    RAZORPAY_WEBHOOK_SECRET: zod_1.z.string().min(1, "RAZORPAY_WEBHOOK_SECRET is required"),
});
const parseEnv = () => {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        console.error("❌ Invalid environment variables:");
        console.error(JSON.stringify(result.error.format(), null, 2));
        process.exit(1);
    }
    return result.data;
};
exports.env = parseEnv();
