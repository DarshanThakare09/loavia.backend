"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const logger_1 = require("./config/logger");
const prisma_1 = require("./config/prisma");
const redis_1 = require("./config/redis");
const server = app_1.default.listen(env_1.env.PORT, async () => {
    logger_1.logger.info(`🚀 Server running in ${env_1.env.NODE_ENV} mode on port ${env_1.env.PORT}`);
    // Establish connection pools
    await (0, prisma_1.connectDb)();
    await (0, redis_1.connectRedis)();
});
// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
    logger_1.logger.error("❌ Uncaught Exception! Shutting down gracefully...", error);
    gracefulShutdown();
});
// Handle unhandled promise rejections
process.on("unhandledRejection", (reason) => {
    logger_1.logger.error("❌ Unhandled Rejection! Shutting down gracefully...", reason);
    gracefulShutdown();
});
const gracefulShutdown = () => {
    logger_1.logger.info("⚡ Shutting down server gracefully...");
    server.close(async () => {
        logger_1.logger.info("⚡ HTTP server closed.");
        try {
            // Close database connections
            await prisma_1.prisma.$disconnect();
            logger_1.logger.info("⚡ Database connection closed.");
            if (redis_1.redis.isOpen) {
                await redis_1.redis.quit();
                logger_1.logger.info("⚡ Redis connection closed.");
            }
            logger_1.logger.info("👋 Shutdown complete.");
            process.exit(0);
        }
        catch (err) {
            logger_1.logger.error("❌ Error during graceful shutdown:", err);
            process.exit(1);
        }
    });
    // Force close after 10 seconds if graceful shutdown hangs
    setTimeout(() => {
        logger_1.logger.error("❌ Forceful shutdown triggered after timeout.");
        process.exit(1);
    }, 10000);
};
// Shutdown signals
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
