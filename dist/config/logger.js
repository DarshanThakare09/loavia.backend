"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json());
const devFormat = winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }), winston_1.default.format.printf(({ timestamp, level, message, stack }) => {
    return `[${timestamp}] ${level}: ${message} ${stack ? `\n${stack}` : ""}`;
}));
exports.logger = winston_1.default.createLogger({
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
    format: logFormat,
    transports: [
        // Write all logs with importance level of `error` or less to `error.log`
        new winston_1.default.transports.File({
            filename: path_1.default.join(process.cwd(), "logs", "error.log"),
            level: "error",
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
        // Write all logs with importance level of `info` or less to `combined.log`
        new winston_1.default.transports.File({
            filename: path_1.default.join(process.cwd(), "logs", "combined.log"),
            maxsize: 5242880, // 5MB
            maxFiles: 5,
        }),
    ],
});
// If we're not in production then log to the `console` with colored format
if (process.env.NODE_ENV !== "production") {
    exports.logger.add(new winston_1.default.transports.Console({
        format: devFormat,
    }));
}
