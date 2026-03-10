# ============================================
# SSS Token Backend Services - Multi-stage Build
# ============================================

# Base stage with Node.js
FROM node:20-alpine AS base

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ curl

# Copy workspace configuration
COPY package.json ./
COPY pnpm-workspace.yaml* ./
COPY tsconfig.base.json* ./

# ============================================
# Dependencies stage
# ============================================
FROM base AS deps

# Copy all package.json files
COPY packages/shared/package.json ./packages/shared/
COPY packages/indexer/package.json ./packages/indexer/
COPY packages/mint-burn-service/package.json ./packages/mint-burn-service/
COPY packages/compliance-service/package.json ./packages/compliance-service/
COPY packages/webhook-service/package.json ./packages/webhook-service/

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# ============================================
# Build stage
# ============================================
FROM deps AS build

# Copy source code
COPY packages ./packages

# Build shared package first
RUN cd packages/shared && pnpm run build

# Build other packages
RUN cd packages/indexer && pnpm run build
RUN cd packages/mint-burn-service && pnpm run build
RUN cd packages/compliance-service && pnpm run build
RUN cd packages/webhook-service && pnpm run build

# ============================================
# Indexer Service
# ============================================
FROM node:20-alpine AS indexer

WORKDIR /app

RUN apk add --no-cache curl

# Copy built files and dependencies
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/indexer/dist ./packages/indexer/dist
COPY --from=build /app/packages/indexer/package.json ./packages/indexer/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Copy SDK
COPY --from=build /app/node_modules/@sss-token ./node_modules/@sss-token || true

ENV NODE_ENV=production

CMD ["node", "packages/indexer/dist/index.js"]

# ============================================
# Mint/Burn Service
# ============================================
FROM node:20-alpine AS mint-burn-service

WORKDIR /app

RUN apk add --no-cache curl

# Copy built files and dependencies
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/mint-burn-service/dist ./packages/mint-burn-service/dist
COPY --from=build /app/packages/mint-burn-service/package.json ./packages/mint-burn-service/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

RUN mkdir -p /app/secrets

ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "packages/mint-burn-service/dist/index.js"]

# ============================================
# Compliance Service
# ============================================
FROM node:20-alpine AS compliance-service

WORKDIR /app

RUN apk add --no-cache curl

# Copy built files and dependencies
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/compliance-service/dist ./packages/compliance-service/dist
COPY --from=build /app/packages/compliance-service/package.json ./packages/compliance-service/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

RUN mkdir -p /app/secrets

ENV NODE_ENV=production

EXPOSE 3002

CMD ["node", "packages/compliance-service/dist/index.js"]

# ============================================
# Webhook Service
# ============================================
FROM node:20-alpine AS webhook-service

WORKDIR /app

RUN apk add --no-cache curl

# Copy built files and dependencies
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/webhook-service/dist ./packages/webhook-service/dist
COPY --from=build /app/packages/webhook-service/package.json ./packages/webhook-service/
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

ENV NODE_ENV=production

EXPOSE 3003

CMD ["node", "packages/webhook-service/dist/index.js"]
</task_progress>
</write_to_file>