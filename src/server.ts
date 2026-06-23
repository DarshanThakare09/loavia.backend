import app from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectDb, prisma } from "./config/prisma";
import { connectRedis, redis } from "./config/redis";
import { emailWorker } from "./queues/email.worker";

const server = app.listen(env.PORT, async () => {
  logger.info(`🚀 Server running in ${env.NODE_ENV} mode on port ${env.PORT}`);
  
  // Establish connection pools
  await connectDb();
  await connectRedis();

  // Start email worker
  emailWorker.start();
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("❌ Uncaught Exception! Shutting down gracefully...", error);
  gracefulShutdown();
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  logger.error("❌ Unhandled Rejection! Shutting down gracefully...", reason as Error);
  gracefulShutdown();
});

const gracefulShutdown = () => {
  logger.info("⚡ Shutting down server gracefully...");

  server.close(async () => {
    logger.info("⚡ HTTP server closed.");

    try {
      // Stop email worker
      await emailWorker.stop();
      logger.info("⚡ Email worker stopped.");

      // Close database connections
      await prisma.$disconnect();
      logger.info("⚡ Database connection closed.");

      if (redis.isOpen) {
        await redis.quit();
        logger.info("⚡ Redis connection closed.");
      }
      
      logger.info("👋 Shutdown complete.");
      process.exit(0);
    } catch (err) {
      logger.error("❌ Error during graceful shutdown:", err);
      process.exit(1);
    }
  });

  // Force close after 10 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error("❌ Forceful shutdown triggered after timeout.");
    process.exit(1);
  }, 10000);
};

// Shutdown signals
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

