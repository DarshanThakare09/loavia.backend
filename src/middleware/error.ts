import { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";
import { ValidationError } from "../errors/ValidationError";
import { logger } from "../config/logger";
import { env } from "../config/env";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = 500;
  let message = "Internal Server Error";
  let errors: any[] | undefined = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    
    if (err instanceof ValidationError) {
      errors = err.errors;
    }

    // Log operational errors at warning level
    logger.warn(`Operational Error [Request ID: ${req.id}]: ${err.message} (${statusCode})`);
  } else {
    // Serious unhandled system error
    logger.error(`System Error [Request ID: ${req.id}]: ${err.message}`, err);
  }

  const responsePayload: any = {
    success: false,
    message,
    ...(errors && { errors }),
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  };

  res.status(statusCode).json(responsePayload);
};
