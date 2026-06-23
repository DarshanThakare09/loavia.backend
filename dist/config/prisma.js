"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDb = exports.prisma = void 0;
const client_1 = require("@prisma/client");
const logger_1 = require("./logger");
exports.prisma = new client_1.PrismaClient({
    log: [
        { emit: "event", level: "query" },
        { emit: "event", level: "info" },
        { emit: "event", level: "warn" },
        { emit: "event", level: "error" },
    ],
});
// Route Prisma logging events to winston
exports.prisma.$on("query", (e) => {
    logger_1.logger.debug(`Prisma Query: ${e.query} [Params: ${e.params}] [Duration: ${e.duration}ms]`);
});
exports.prisma.$on("info", (e) => {
    logger_1.logger.info(`Prisma Info: ${e.message}`);
});
exports.prisma.$on("warn", (e) => {
    logger_1.logger.warn(`Prisma Warning: ${e.message}`);
});
exports.prisma.$on("error", (e) => {
    logger_1.logger.error(`Prisma Error: ${e.message}`);
});
const connectDb = async () => {
    try {
        await exports.prisma.$connect();
        logger_1.logger.info("⚡ Database connected successfully");
    }
    catch (error) {
        logger_1.logger.error("❌ Database connection failed:", error);
        process.exit(1);
    }
};
exports.connectDb = connectDb;
