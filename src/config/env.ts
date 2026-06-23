import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file
dotenv.config();

const envSchema = z.object({
  // SERVER CONFIGURATION
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  // DATABASE
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // AUTH
  JWT_SECRET: z.string().min(8, "JWT_SECRET must be at least 8 characters"),
  JWT_REFRESH_SECRET: z.string().min(8, "JWT_REFRESH_SECRET must be at least 8 characters"),

  // CACHE
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  // EMAIL
  RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),

  // STORAGE
  CLOUDINARY_URL: z.string().min(1, "CLOUDINARY_URL is required"),

  // PAYMENTS
  RAZORPAY_KEY_ID: z.string().min(1, "RAZORPAY_KEY_ID is required"),
  RAZORPAY_KEY_SECRET: z.string().min(1, "RAZORPAY_KEY_SECRET is required"),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1, "RAZORPAY_WEBHOOK_SECRET is required"),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  // Production hardening validations
  if (result.data.NODE_ENV === "production") {
    if (
      result.data.JWT_SECRET === "supersecret_access_token_sign_key_change_in_production" ||
      result.data.JWT_SECRET.includes("change_in_production")
    ) {
      console.error("❌ JWT_SECRET must be changed to a secure, unique key in production environment.");
      process.exit(1);
    }
    if (
      result.data.JWT_REFRESH_SECRET === "supersecret_refresh_token_sign_key_change_in_production" ||
      result.data.JWT_REFRESH_SECRET.includes("change_in_production")
    ) {
      console.error("❌ JWT_REFRESH_SECRET must be changed to a secure, unique key in production environment.");
      process.exit(1);
    }
    if (result.data.FRONTEND_URL.includes("localhost") || result.data.FRONTEND_URL.includes("127.0.0.1")) {
      console.warn("⚠️ Warning: FRONTEND_URL points to localhost in production mode.");
    }
  }

  return result.data;
};

export const env = parseEnv();
