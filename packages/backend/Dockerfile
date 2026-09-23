# syntax=docker/dockerfile:1
#
# Backend API server (Express + Prisma).
#
# IMPORTANT: build with the REPOSITORY ROOT as the build context, because this
# is an npm-workspaces monorepo and the lockfile lives at the root:
#
#   docker build -f packages/backend/Dockerfile -t educational-notes-backend .
#
# docker-compose.yml at the repo root already does this.

# ---------------------------------------------------------------------------
# Stage 1: install dependencies and compile TypeScript
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# bcrypt is a native module; python3/make/g++ are needed when no prebuilt
# binary is available for the target platform. openssl is required by Prisma.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
        openssl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy only the manifests first so dependency installation is cached.
# Every workspace manifest is required for `npm ci` to resolve the lockfile.
COPY package.json package-lock.json ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/student-frontend/package.json ./packages/student-frontend/
COPY packages/admin-frontend/package.json ./packages/admin-frontend/

RUN npm ci

# Source
COPY tsconfig.json ./
COPY packages/backend ./packages/backend

# Generate the Prisma client, then compile to packages/backend/dist
RUN npm run prisma:generate --workspace @educational-notes/backend \
    && npm run build --workspace @educational-notes/backend

# ---------------------------------------------------------------------------
# Stage 2: runtime
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runner

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# The whole tree is carried over so that the Prisma CLI (`prisma migrate
# deploy`) and the seed script (`npm run db:seed`) can be executed inside this
# container during deployments. That keeps dev dependencies in the image; if
# you prefer a slimmer image, run migrations from a separate job/container.
COPY --from=builder --chown=node:node /app /app

# Directory for locally stored note images (UPLOAD_DIR). Mount a volume here
# in production, or configure object storage instead.
RUN mkdir -p /app/packages/backend/uploads && chown -R node:node /app/packages/backend/uploads

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

WORKDIR /app/packages/backend

CMD ["node", "dist/index.js"]
