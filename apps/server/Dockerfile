# syntax=docker/dockerfile:1
# Build from the repo root:  docker build -f apps/server/Dockerfile .
# One image runs the API (default), the worker (node dist/worker.js) and migrations (npx prisma migrate deploy).

FROM node:22-slim AS base
# Prisma's query engine needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/server/package.json apps/server/
RUN npm ci --workspace apps/server --include-workspace-root=false
COPY apps/server apps/server
RUN npm run build --workspace apps/server

FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
RUN npm ci --workspace apps/server --include-workspace-root=false --omit=dev && npm cache clean --force
COPY apps/server/prisma apps/server/prisma
RUN cd apps/server && npx prisma generate
COPY --from=build /app/apps/server/dist apps/server/dist

WORKDIR /app/apps/server
USER node
EXPOSE 8080
# No HEALTHCHECK here: the same image runs the worker, which has no HTTP port.
# The load balancer checks /readyz on the API instead.
CMD ["node", "dist/index.js"]
