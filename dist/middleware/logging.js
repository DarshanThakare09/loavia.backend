"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = void 0;
const morgan_1 = __importDefault(require("morgan"));
const logger_1 = require("../config/logger");
// Register custom morgan token for Request ID
morgan_1.default.token("id", (req) => req.id || "");
// Request logging format
const format = process.env.NODE_ENV === "production"
    ? ":remote-addr - :remote-user [:date[clf]] ':method :url HTTP/:http-version' :status :res[content-length] ':referrer' ':user-agent' [Request ID: :id]"
    : ":method :url :status :response-time ms - :res[content-length] [Request ID: :id]";
exports.requestLogger = (0, morgan_1.default)(format, {
    stream: {
        write: (message) => logger_1.logger.info(message.trim()),
    },
});
