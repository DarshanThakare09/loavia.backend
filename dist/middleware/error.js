"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const AppError_1 = require("../errors/AppError");
const ValidationError_1 = require("../errors/ValidationError");
const logger_1 = require("../config/logger");
const env_1 = require("../config/env");
const errorHandler = (err, req, res, _next) => {
    let statusCode = 500;
    let message = "Internal Server Error";
    let errors = undefined;
    if (err instanceof AppError_1.AppError) {
        statusCode = err.statusCode;
        message = err.message;
        if (err instanceof ValidationError_1.ValidationError) {
            errors = err.errors;
        }
        // Log operational errors at warning level
        logger_1.logger.warn(`Operational Error [Request ID: ${req.id}]: ${err.message} (${statusCode})`);
    }
    else {
        // Serious unhandled system error
        logger_1.logger.error(`System Error [Request ID: ${req.id}]: ${err.message}`, err);
    }
    const responsePayload = {
        success: false,
        message,
        ...(errors && { errors }),
        ...(env_1.env.NODE_ENV === "development" && { stack: err.stack }),
    };
    res.status(statusCode).json(responsePayload);
};
exports.errorHandler = errorHandler;
