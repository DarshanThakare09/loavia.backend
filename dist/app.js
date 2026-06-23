"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const compression_1 = __importDefault(require("compression"));
const hpp_1 = __importDefault(require("hpp"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const env_1 = require("./config/env");
const requestContext_1 = require("./middleware/requestContext");
const logging_1 = require("./middleware/logging");
const rateLimiter_1 = require("./middleware/rateLimiter");
const error_1 = require("./middleware/error");
const NotFoundError_1 = require("./errors/NotFoundError");
const apiResponse_1 = require("./utils/apiResponse");
const prisma_1 = require("./config/prisma");
const redis_1 = require("./config/redis");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const app = (0, express_1.default)();
// Security Middlewares
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: env_1.env.FRONTEND_URL,
    credentials: true,
}));
app.use((0, hpp_1.default)());
// Rate Limiting applied globally to all /api/ requests
app.use("/api", rateLimiter_1.apiLimiter);
// Payload & Context Middlewares
app.use((0, compression_1.default)());
app.use((0, cookie_parser_1.default)());
app.use(express_1.default.json({ limit: "1mb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "1mb" }));
// Attach Request Context Metadata
app.use(requestContext_1.requestContext);
// Stream HTTP Requests Logs
app.use(logging_1.requestLogger);
// Authentication Routes
app.use("/api/v1/auth", auth_routes_1.default);
// Health Check Endpoints
app.get("/api/v1/health/live", (_req, res) => {
    (0, apiResponse_1.sendSuccess)(res, { status: "ok" }, "Server is live");
});
app.get("/api/v1/health/ready", async (_req, res) => {
    const checks = {
        postgres: "unknown",
        redis: "unknown",
        cloudinary: "unknown",
        resend: "unknown",
    };
    try {
        // 1. PostgreSQL check
        await prisma_1.prisma.$queryRaw `SELECT 1`;
        checks.postgres = "connected";
    }
    catch (err) {
        checks.postgres = "disconnected";
    }
    try {
        // 2. Redis check
        if (redis_1.redis.isOpen && (await redis_1.redis.ping()) === "PONG") {
            checks.redis = "connected";
        }
        else {
            checks.redis = "disconnected";
        }
    }
    catch (err) {
        checks.redis = "disconnected";
    }
    // 3. Cloudinary check (validate credentials exist)
    if (env_1.env.CLOUDINARY_URL) {
        checks.cloudinary = "configured";
    }
    else {
        checks.cloudinary = "missing";
    }
    // 4. Resend check (validate credentials exist)
    if (env_1.env.RESEND_API_KEY) {
        checks.resend = "configured";
    }
    else {
        checks.resend = "missing";
    }
    const isReady = Object.values(checks).every((status) => status === "connected" || status === "configured");
    if (isReady) {
        (0, apiResponse_1.sendSuccess)(res, { checks }, "System is ready");
    }
    else {
        res.status(503).json({
            success: false,
            message: "System is not ready",
            data: { checks },
        });
    }
});
// Deprecated legacy alias for readiness checks
app.get("/api/v1/health", (_req, res) => {
    res.redirect("/api/v1/health/ready");
});
// Fallback Route Handler (404)
app.use((_req, _res, next) => {
    next(new NotFoundError_1.NotFoundError("Route not found"));
});
// Global Error Handler boundary
app.use(error_1.errorHandler);
exports.default = app;
