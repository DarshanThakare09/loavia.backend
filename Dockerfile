# STAGE 1: Build dependency compiles
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci

COPY src ./src

# Generate Prisma Client & compile TS to JS
RUN npx prisma generate
RUN npm run build

# STAGE 2: Lightweight production runner
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules/@prisma/client ./node_modules/@prisma/client

EXPOSE 5000

CMD ["node", "dist/server.js"]
