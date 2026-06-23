import { PrismaClient, Prisma } from "@prisma/client";
import { logger } from "./logger";

export const prisma = new PrismaClient({
  log: [
    { emit: "event", level: "query" },
    { emit: "event", level: "info" },
    { emit: "event", level: "warn" },
    { emit: "event", level: "error" },
  ],
});

// Route Prisma logging events to winston
prisma.$on("query", (e: Prisma.QueryEvent) => {
  logger.debug(`Prisma Query: ${e.query} [Params: ${e.params}] [Duration: ${e.duration}ms]`);
});

prisma.$on("info", (e: Prisma.LogEvent) => {
  logger.info(`Prisma Info: ${e.message}`);
});

prisma.$on("warn", (e: Prisma.LogEvent) => {
  logger.warn(`Prisma Warning: ${e.message}`);
});

prisma.$on("error", (e: Prisma.LogEvent) => {
  logger.error(`Prisma Error: ${e.message}`);
});

export const connectDb = async () => {
  try {
    await prisma.$connect();
    logger.info("⚡ Database connected successfully");
  } catch (error) {
    logger.error("❌ Database connection failed:", error);
    process.exit(1);
  }
};
