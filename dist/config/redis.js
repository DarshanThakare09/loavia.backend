"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRedis = exports.redis = void 0;
const redis_1 = require("redis");
const env_1 = require("./env");
const logger_1 = require("./logger");
exports.redis = (0, redis_1.createClient)({
    url: env_1.env.REDIS_URL,
});
exports.redis.on("connect", () => {
    logger_1.logger.info("⚡ Redis client connecting...");
});
exports.redis.on("ready", () => {
    logger_1.logger.info("⚡ Redis connected and ready to use");
});
exports.redis.on("error", (err) => {
    logger_1.logger.error("❌ Redis Error:", err);
});
exports.redis.on("end", () => {
    logger_1.logger.warn("❌ Redis connection closed");
});
const connectRedis = async () => {
    try {
        await exports.redis.connect();
    }
    catch (error) {
        logger_1.logger.error("❌ Redis connection failed:", error);
        // In local development, we might not want to crash the app immediately if Redis is down,
        // but in production, caching layer readiness is critical.
        if (env_1.env.NODE_ENV === "production") {
            process.exit(1);
        }
    }
};
exports.connectRedis = connectRedis;
