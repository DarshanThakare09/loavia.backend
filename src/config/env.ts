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
  // Set RAZORPAY_ENABLED=true to activate the payment gateway.
  // When absent or set to anything other than "true", Razorpay is fully disabled
  // and the three credential variables below are NOT required.
  RAZORPAY_ENABLED: z.string().optional(), // "true" | anything else = disabled
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(result.error.format(), null, 2));
    process.exit(1);
  }

  const data = result.data;

  // Derive a strongly-typed boolean from the raw string value.
  // IMPORTANT: z.coerce.boolean() would incorrectly treat "false" as true,
  // so we compare the raw string explicitly.
  const razorpayEnabled = data.RAZORPAY_ENABLED === "true";

  // When Razorpay is explicitly enabled, all three credentials are required.
  if (razorpayEnabled) {
    const missing: string[] = [];
    if (!data.RAZORPAY_KEY_ID) missing.push("RAZORPAY_KEY_ID");
    if (!data.RAZORPAY_KEY_SECRET) missing.push("RAZORPAY_KEY_SECRET");
    if (!data.RAZORPAY_WEBHOOK_SECRET) missing.push("RAZORPAY_WEBHOOK_SECRET");
    if (missing.length > 0) {
      console.error(`❌ RAZORPAY_ENABLED=true but missing required variables: ${missing.join(", ")}`);
      process.exit(1);
    }
  }

  // Production hardening validations
  if (data.NODE_ENV === "production") {
    if (
      data.JWT_SECRET === "supersecret_access_token_sign_key_change_in_production" ||
      data.JWT_SECRET.includes("change_in_production")
    ) {
      console.error("❌ JWT_SECRET must be changed to a secure, unique key in production environment.");
      process.exit(1);
    }
    if (
      data.JWT_REFRESH_SECRET === "supersecret_refresh_token_sign_key_change_in_production" ||
      data.JWT_REFRESH_SECRET.includes("change_in_production")
    ) {
      console.error("❌ JWT_REFRESH_SECRET must be changed to a secure, unique key in production environment.");
      process.exit(1);
    }
    if (data.FRONTEND_URL.includes("localhost") || data.FRONTEND_URL.includes("127.0.0.1")) {
      console.warn("⚠️ Warning: FRONTEND_URL points to localhost in production mode.");
    }
  }

  return { ...data, razorpayEnabled };
};

export const env = parseEnv();
