import morgan from "morgan";
import { Request } from "express";
import { logger } from "../config/logger";

// Register custom morgan token for Request ID
morgan.token("id", (req: Request) => req.id || "");

// Request logging format
const format = process.env.NODE_ENV === "production"
  ? ":remote-addr - :remote-user [:date[clf]] ':method :url HTTP/:http-version' :status :res[content-length] ':referrer' ':user-agent' [Request ID: :id]"
  : ":method :url :status :response-time ms - :res[content-length] [Request ID: :id]";

export const requestLogger = morgan(format, {
  stream: {
    write: (message: string) => logger.info(message.trim()),
  },
});
