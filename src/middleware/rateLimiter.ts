import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";

const logRateLimitViolation = (req: Request, _options: any) => {
  logger.warn(`Rate limit exceeded by IP: ${req.ip} for path: ${req.path} [Request ID: ${req.id}]`);
};

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes."
  },
  handler: (req: Request, res: Response, _next: NextFunction, options: any) => {
    logRateLimitViolation(req, options);
    res.status(options.statusCode).send(options.message);
  }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login/register requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts, please try again after 15 minutes."
  },
  handler: (req: Request, res: Response, _next: NextFunction, options: any) => {
    logRateLimitViolation(req, options);
    res.status(options.statusCode).send(options.message);
  }
});
