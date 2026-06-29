import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import hpp from "hpp";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { requestContext } from "./middleware/requestContext";
import { requestLogger } from "./middleware/logging";
import { errorHandler } from "./middleware/error";
import { NotFoundError } from "./errors/NotFoundError";
import { sendSuccess } from "./utils/apiResponse";
import { prisma } from "./config/prisma";
import { redis } from "./config/redis";
import authRouter from "./routes/auth.routes";
import adminCatalogRouter from "./routes/adminCatalog.routes";
import publicCatalogRouter from "./routes/publicCatalog.routes";
import adminInventoryRouter from "./routes/adminInventory.routes";
import cartRouter from "./routes/cart.routes";
import wishlistRouter from "./routes/wishlist.routes";
import orderRouter from "./routes/order.routes";
import shipmentRouter from "./routes/shipment.routes";
import adminOrderRouter from "./routes/adminOrder.routes";
import paymentRouter from "./routes/payment.routes";
import adminPaymentRouter from "./routes/adminPayment.routes";
import adminEmailRouter from "./routes/adminEmail.routes";
import adminRouter from "./routes/admin.routes";
import reviewRouter from "./routes/review.routes";

const app = express();

// Security Middlewares
app.use(helmet());
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow any origin dynamically for testing across different network hosts/IPs
      callback(null, origin || true);
    },
    credentials: true,
  })
);
app.use(hpp());



// Payload & Context Middlewares
app.use(compression());
app.use(cookieParser());
app.use(
  express.json({
    limit: "1mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Attach Request Context Metadata
app.use(requestContext);

// Stream HTTP Requests Logs
app.use(requestLogger);

// Authentication Routes
app.use("/api/v1/auth", authRouter);

// Cart & Wishlist Routes
app.use("/api/v1/cart", cartRouter);
app.use("/api/v1/wishlist", wishlistRouter);

// Checkout & Order Routes
app.use("/api/v1", orderRouter);
app.use("/api/v1", shipmentRouter);
app.use("/api/v1", paymentRouter);

// Catalog & Inventory Routes
app.use("/api/v1/admin/inventory", adminInventoryRouter);
app.use("/api/v1/admin", adminOrderRouter);
app.use("/api/v1/admin", adminPaymentRouter);
app.use("/api/v1/admin", adminEmailRouter);
app.use("/api/v1/admin", adminCatalogRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1", publicCatalogRouter);
app.use("/api/v1", reviewRouter); // Public review submission

// Health Check Endpoints
app.get("/api/v1/health/live", (_req, res) => {
  sendSuccess(res, { status: "ok" }, "Server is live");
});

app.get("/api/v1/health/ready", async (_req, res) => {
  const checks: Record<string, string> = {
    postgres: "unknown",
    redis: "unknown",
    cloudinary: "unknown",
    resend: "unknown",
  };

  try {
    // 1. PostgreSQL check
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = "connected";
  } catch (err) {
    checks.postgres = "disconnected";
  }

  try {
    // 2. Redis check
    if (redis.isOpen && (await redis.ping()) === "PONG") {
      checks.redis = "connected";
    } else {
      checks.redis = "disconnected";
    }
  } catch (err) {
    checks.redis = "disconnected";
  }

  // 3. Cloudinary check (validate credentials exist)
  if (env.CLOUDINARY_URL) {
    checks.cloudinary = "configured";
  } else {
    checks.cloudinary = "missing";
  }

  // 4. Resend check (validate credentials exist)
  if (env.RESEND_API_KEY) {
    checks.resend = "configured";
  } else {
    checks.resend = "missing";
  }

  const isReady = Object.values(checks).every(
    (status) => status === "connected" || status === "configured"
  );

  if (isReady) {
    sendSuccess(res, { checks }, "System is ready");
  } else {
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
  next(new NotFoundError("Route not found"));
});

// Global Error Handler boundary
app.use(errorHandler);

export default app;
