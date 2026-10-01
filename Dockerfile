# ─────────────────────────────────────────────────────────────────────────────
# STAGE 1: Builder
# Uses node:20-alpine. Alpine 3.18+ ships with OpenSSL 3 (libssl.so.3).
# We install openssl here so the Prisma CLI can detect the version and
# generate the correct linux-musl-openssl-3.0.x query-engine binary.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# Install OpenSSL 3 so Prisma generate picks the right engine binary.
# Also install libc6-compat for glibc compatibility shims.
RUN apk add --no-cache openssl libc6-compat

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci

COPY src ./src

# Generate Prisma Client with the linux-musl-openssl-3.0.x binary target
# (declared in schema.prisma binaryTargets) and compile TypeScript.
RUN npx prisma generate && npm run build

# ─────────────────────────────────────────────────────────────────────────────
# STAGE 2: Production runner
# Same Alpine base as builder — must have the SAME OpenSSL version so the
# Prisma query engine binary can find libssl.so.3 at runtime.
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Install OpenSSL 3 (provides libssl.so.3 required by the Prisma query engine)
# and libc6-compat. Without this the PrismaClient throws:
#   Error loading shared library libssl.so.1.1: No such file or directory
RUN apk add --no-cache openssl libc6-compat

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy compiled application from builder
COPY --from=builder /usr/src/app/dist ./dist

# Copy the generated Prisma Client (includes the linux-musl-openssl-3.0.x engine)
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 5000

# Run DB migrations then start the server.
# "prisma migrate deploy" is safe to run on every startup — it is idempotent
# and only applies pending migrations; it never resets data.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
