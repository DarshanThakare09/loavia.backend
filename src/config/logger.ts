import winston from "winston";
import path from "path";
import fs from "fs";

const isProduction = process.env.NODE_ENV === "production";

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `[${timestamp}] ${level}: ${message} ${stack ? `\n${stack}` : ""}`;
  })
);

// Always log to stdout — required for cloud platforms (Render, Railway, Fly.io, etc.)
// that capture stdout/stderr for log aggregation.
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: isProduction ? logFormat : devFormat,
  }),
];

// Add file transports only when the logs directory is writable (local / Docker with a volume).
const logsDir = path.join(process.cwd(), "logs");
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  fs.accessSync(logsDir, fs.constants.W_OK);
  transports.push(
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 5242880,
      maxFiles: 5,
    })
  );
} catch {
  // Filesystem is read-only (common on cloud platforms). stdout-only logging is fine.
}

export const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  format: logFormat,
  transports,
});
