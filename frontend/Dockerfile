# syntax=docker/dockerfile:1
# EduComply web portal. Build context: repository root
#   docker compose -p educomply --profile app build frontend
ARG NODE_VERSION=24

# ── 1. Build the static bundle (tsc + vite build) ──
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace frontend --include-workspace-root=false --ignore-scripts --no-audit --no-fund
COPY frontend/ frontend/
RUN npm run build --workspace frontend

# ── 2. Serve with unprivileged nginx; /api is proxied to the backend container ──
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
