import { createClient } from "redis";
import { env } from "./env";
import { logger } from "./logger";

export const redis = createClient({
  url: env.REDIS_URL,
  disableOfflineQueue: true,
});

redis.on("connect", () => {
  logger.info("⚡ Redis client connecting...");
});

redis.on("ready", () => {
  logger.info("⚡ Redis connected and ready to use");
});

redis.on("error", (err) => {
  logger.error("❌ Redis Error:", err);
});

redis.on("end", () => {
  logger.warn("❌ Redis connection closed");
});

export const connectRedis = async () => {
  try {
    await redis.connect();
  } catch (error) {
    logger.error("❌ Redis connection failed:", error);
    // In local development, we might not want to crash the app immediately if Redis is down,
    // but in production, caching layer readiness is critical.
    if (env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
};
