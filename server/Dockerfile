# Multi-stage Dockerfile for NestJS Server
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci --legacy-peer-deps

# Provide dummy/default DATABASE_URL during build for Prisma Client generation
ENV DATABASE_URL="sqlserver://localhost:1433;database=chat_db;user=sa;password=Chat@123456;trustServerCertificate=true"

# Generate Prisma Client
RUN npx prisma generate

# Copy source code
COPY . .

# Build application
RUN npm run build

# Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8000

# Copy necessary runtime files
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Create upload directory and set permissions
RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 8000

CMD ["node", "dist/main.js"]

