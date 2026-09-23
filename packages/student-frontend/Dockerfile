# syntax=docker/dockerfile:1
#
# Student-facing frontend (Next.js 14, port 3000).
#
# Build from the REPOSITORY ROOT:
#
#   docker build -f packages/student-frontend/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 \
#     -t educational-notes-student-frontend .
#
# NEXT_PUBLIC_API_URL is inlined at build time by Next.js, so it must be passed
# as a build argument - setting it only at runtime has no effect on the client
# bundle.

# ---------------------------------------------------------------------------
# Stage 1: install dependencies and build
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Build toolchain for native modules present elsewhere in the workspace
# (bcrypt in the backend package is installed by the shared lockfile).
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/student-frontend/package.json ./packages/student-frontend/
COPY packages/admin-frontend/package.json ./packages/admin-frontend/

RUN npm ci

COPY tsconfig.json ./
COPY packages/student-frontend ./packages/student-frontend

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build --workspace @educational-notes/student-frontend

# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /app /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

WORKDIR /app/packages/student-frontend

CMD ["npm", "run", "start"]
