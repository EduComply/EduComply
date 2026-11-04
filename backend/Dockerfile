# syntax=docker/dockerfile:1
# EduComply API. Build context: repository root
#   docker compose -p educomply --profile app build backend
ARG NODE_VERSION=24

# ── 1. Build: install backend workspace deps, generate the Prisma client, compile TS ──
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# Lockfile-exact install of the backend workspace only; no lifecycle scripts.
RUN npm ci --workspace backend --include-workspace-root=false --ignore-scripts --no-audit --no-fund
COPY backend/ backend/
# prisma generate needs no database connection (prisma.config.ts falls back to an empty URL).
RUN npm run build --workspace backend

# ── 2. Runtime: production dependencies + compiled output, non-root ──
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_OPTIONS=--enable-source-maps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
# Note: npm keeps @prisma/client's optional peers (Prisma CLI, TypeScript) here, which is
# why the image is larger than strictly necessary; they are not used at runtime.
RUN npm ci --workspace backend --include-workspace-root=false --omit=dev \
      --ignore-scripts --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /app/backend/dist backend/dist
WORKDIR /app/backend
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
