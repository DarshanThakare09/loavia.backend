# LOAVIA Backend Foundation — Phase 1

This folder contains the production-ready backend foundation for the LOAVIA e-commerce platform.

---

## 1. Project Folder Structure

```text
backend/
├── docs/                      # Architectural & API documents source of truth
│   ├── architecture/
│   ├── api/
│   ├── database/
│   └── deployment/
├── logs/                      # Winston logs folder (Local gitignored)
├── prisma/                    # Prisma DB schemas and migrations
│   └── schema.prisma
├── src/
│   ├── @types/                # Global type overrides
│   │   └── express.d.ts       # Request context type definitions
│   ├── config/                # Environment, db configs, and winston configurations
│   │   ├── env.ts
│   │   ├── logger.ts
│   │   ├── prisma.ts
│   │   └── redis.ts
│   ├── errors/                # Structured error handlers hierarchy
│   │   ├── AppError.ts
│   │   ├── BadRequestError.ts
│   │   ├── ConflictError.ts
│   │   ├── ForbiddenError.ts
│   │   ├── NotFoundError.ts
│   │   ├── UnauthorizedError.ts
│   │   └── ValidationError.ts
│   ├── middleware/            # Security, logging, and validations middlewares
│   │   ├── error.ts
│   │   ├── logging.ts
│   │   ├── rateLimiter.ts
│   │   ├── requestContext.ts
│   │   └── validator.ts
│   ├── utils/                 # General helpers and response formatters
│   │   ├── apiResponse.ts
│   │   └── asyncHandler.ts
│   ├── app.ts                 # Express core routing setups
│   └── server.ts              # Connection pools and server bootstrapper
├── tsconfig.json              # TypeScript compilation setup
├── Dockerfile                 # Multi-stage production container setup
└── docker-compose.yml         # Dev environment container stack (PG, Redis, pgAdmin)
```

---

## 2. Environment Variables Reference

| Variable | Category | Description | Local Development Value |
| :--- | :--- | :--- | :--- |
| `PORT` | SERVER | Express server listening port | `5000` |
| `NODE_ENV` | SERVER | Deployment runtime mode | `development` |
| `FRONTEND_URL` | SERVER | CORS whitelist origin target | `http://localhost:3000` |
| `DATABASE_URL` | DATABASE | Neon PostgreSQL connection string | `"postgresql://..."` |
| `JWT_SECRET` | AUTH | Core Access Token HMAC signing key | `[8+ char key]` |
| `JWT_REFRESH_SECRET` | AUTH | Core Refresh Token HMAC signing key | `[8+ char key]` |
| `REDIS_URL` | CACHE | Redis caching instance endpoints | `redis://localhost:6379` |
| `RESEND_API_KEY` | EMAIL | Resend mailer authentication key | `re_123456...` |
| `CLOUDINARY_URL` | STORAGE | Cloudinary secure storage connection | `cloudinary://...` |
| `RAZORPAY_KEY_ID` | PAYMENTS | Razorpay public integration key | `rzp_test_...` |
| `RAZORPAY_KEY_SECRET` | PAYMENTS | Razorpay private integration key | `rzp_secret_...` |
| `RAZORPAY_WEBHOOK_SECRET` | PAYMENTS | Razorpay SHA256 webhook validator key | `rzp_webhook_...` |

---

## 3. Development Setup & Scripts

### Prerequisites
- Node.js (v20+)
- Docker and Docker Compose (Optional for local PostgreSQL and Redis)

### Running Database & Services via Docker
Start Postgres, Redis, and pgAdmin services locally:
```bash
docker compose up -d
```
- **pgAdmin Console:** Available at `http://localhost:5050` (User: `admin@loavia.in`, Pass: `admin_password_123`).

### Project Installation
Install npm dependencies:
```bash
npm install
```

### Run Server in Development
Start nodemon watcher compiles:
```bash
npm run dev
```

### Health Endpoints Check
Verify connections status:
- **Live Check:** `GET http://localhost:5000/api/v1/health/live`
- **Ready Check:** `GET http://localhost:5000/api/v1/health/ready` (Returns connectivity metrics for PostgreSQL and Redis).
