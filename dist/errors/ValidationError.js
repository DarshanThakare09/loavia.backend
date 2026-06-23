"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = void 0;
const AppError_1 = require("./AppError");
class ValidationError extends AppError_1.AppError {
    errors;
    constructor(errors, message = "Validation Failed") {
        super(message, 422);
        this.errors = errors;
    }
}
exports.ValidationError = ValidationError;
