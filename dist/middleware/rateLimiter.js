"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authLimiter = exports.apiLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const logger_1 = require("../config/logger");
const logRateLimitViolation = (req, _options) => {
    logger_1.logger.warn(`Rate limit exceeded by IP: ${req.ip} for path: ${req.path} [Request ID: ${req.id}]`);
};
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: {
        success: false,
        message: "Too many requests from this IP, please try again after 15 minutes."
    },
    handler: (req, res, _next, options) => {
        logRateLimitViolation(req, options);
        res.status(options.statusCode).send(options.message);
    }
});
exports.authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 login/register requests per window
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many authentication attempts, please try again after 15 minutes."
    },
    handler: (req, res, _next, options) => {
        logRateLimitViolation(req, options);
        res.status(options.statusCode).send(options.message);
    }
});
