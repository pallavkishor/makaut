# Deployment Guide

Educational Notes Platform - an npm-workspaces monorepo with three deployable
services:

| Service            | Package                      | Port | Stack                       |
| ------------------ | ---------------------------- | ---- | --------------------------- |
| Backend API        | `packages/backend`           | 3001 | Node.js 20, Express, Prisma |
| Student platform   | `packages/student-frontend`  | 3000 | Next.js 14                  |
| Admin panel        | `packages/admin-frontend`    | 3002 | Next.js 14                  |

PostgreSQL 15 is the only external dependency.

> No document in this repository contains real secret values. Every variable
> below must be supplied by your environment, secret manager, or a local `.env`
> file that is never committed (`.env` is already git-ignored).

---

## 1. Required environment variables

### Backend (`packages/backend`)

Copy `packages/backend/.env.example` to `packages/backend/.env` for local runs.

| Variable                  | Required             | Purpose                                                                 |
| ------------------------- | -------------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`            | yes                  | PostgreSQL connection string, e.g. `postgresql://USER:PASSWORD@HOST:5432/educational_notes?schema=public` |
| `JWT_SECRET`              | yes                  | Signing key for session tokens. Use a long random value, unique per environment. |
| `NODE_ENV`                | recommended          | `development` \| `test` \| `production`                                  |
| `PORT`                    | no (default `3001`)  | HTTP port for the API                                                    |
| `CORS_ORIGIN`             | recommended          | Comma-separated allowed origins, e.g. the student and admin URLs         |
| `RATE_LIMIT_WINDOW_MS`    | no (default `900000`)| Auth rate-limit window (15 minutes)                                      |
| `RATE_LIMIT_MAX_REQUESTS` | no (default `5`)     | Auth attempts allowed per window                                         |
| `UPLOAD_DIR`              | no (default `./uploads`) | Filesystem location for note images                                  |
| `MAX_FILE_SIZE`           | no (default `5242880`)| Maximum image upload size in bytes (5 MB)                               |
| `SESSION_TIMEOUT_STUDENT` | no (default `86400000`)| Student session lifetime in ms (24 hours)                              |
| `SESSION_TIMEOUT_ADMIN`   | no (default `1800000`)| Admin session lifetime in ms (30 minutes)                               |

`validateConfig()` aborts startup when `DATABASE_URL` or `JWT_SECRET` is
missing (outside the `test` environment), so a misconfigured deployment fails
fast instead of running insecurely.

Seed-only variables, read by `prisma/seed.ts` and not by the running server:

| Variable               | Required for seeding | Purpose                                              |
| ---------------------- | -------------------- | ---------------------------------------------------- |
| `SEED_ADMIN_EMAIL`     | no (default `admin@example.com`) | Email of the initial administrator        |
| `SEED_ADMIN_PASSWORD`  | **yes**              | Initial administrator password. No default exists; seeding fails if unset. |

### Student platform (`packages/student-frontend`)

| Variable                | Required | Purpose                                                        |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`   | yes      | Browser-reachable base URL of the backend API                   |
| `PORT`                  | no       | Defaults to 3000 (`next start -p 3000`)                         |

### Admin panel (`packages/admin-frontend`)

| Variable                | Required | Purpose                                                        |
| ----------------------- | -------- | -------------------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`   | yes      | Browser-reachable base URL of the backend API                   |
| `PORT`                  | no       | Defaults to 3002 (`next start -p 3002`)                         |

`NEXT_PUBLIC_*` values are inlined into the client bundle **at build time**.
Changing them requires a rebuild; setting them only at runtime has no effect.
Never put a secret in a `NEXT_PUBLIC_*` variable - it ships to the browser.

---

## 2. Database migrations

Migrations live in `packages/backend/prisma/migrations` and are applied with the
Prisma CLI. Run every command from `packages/backend` (or add
`--workspace @educational-notes/backend`).

Production / CI - apply committed migrations without generating new ones:

```bash
npx prisma migrate deploy
# or: npm run prisma:deploy
```

`migrate deploy` is idempotent, never prompts, and never drops data. It is the
only migration command that should run against a production database.

Development - create and apply a new migration after editing `schema.prisma`:

```bash
npm run prisma:migrate          # prisma migrate dev
```

Regenerate the Prisma client after a schema change (the build does this too):

```bash
npm run prisma:generate
```

Recommended ordering for a release: run migrations first, wait for success,
then roll out the new backend image. Keep migrations backward compatible with
the previous application version so a rollback does not require a down
migration.

---

## 3. Seeding the first administrator

There is no self-service admin signup, so the first administrator must be
seeded. The script hashes the password with bcrypt (cost factor 12) using the
same utility the application uses, and upserts by email - running it twice is
safe.

```bash
cd packages/backend
SEED_ADMIN_EMAIL=admin@yourdomain.test \
SEED_ADMIN_PASSWORD='<choose-a-strong-password>' \
npm run db:seed
```

PowerShell:

```powershell
cd packages/backend
$env:SEED_ADMIN_EMAIL = 'admin@yourdomain.test'
$env:SEED_ADMIN_PASSWORD = '<choose-a-strong-password>'
npm run db:seed
```

Inside a running Docker Compose stack:

```bash
docker compose exec \
  -e SEED_ADMIN_EMAIL=admin@yourdomain.test \
  -e SEED_ADMIN_PASSWORD='<choose-a-strong-password>' \
  backend npm run db:seed
```

Notes:

- Seeding aborts with a non-zero exit code if `SEED_ADMIN_PASSWORD` is unset,
  shorter than 8 characters, or if `SEED_ADMIN_EMAIL` is not a valid address.
- Prefer passing the password from your secret manager for the single seed run,
  then discarding it. Avoid leaving it in shell history or a committed file.
- Re-running with a different password rotates the hash for that email, which
  doubles as an emergency password reset.
- Run migrations before seeding.

---

## 4. Local development with Docker Compose

`docker-compose.yml` at the repo root starts PostgreSQL 15 plus all three
services. PostgreSQL data persists in the named volume `postgres-data`, and
uploaded note images in `backend-uploads`.

```bash
docker compose up --build
```

| URL                     | Service                       |
| ----------------------- | ----------------------------- |
| http://localhost:3000   | Student platform              |
| http://localhost:3001   | Backend API (`/health`)       |
| http://localhost:3002   | Admin panel                   |
| localhost:5432          | PostgreSQL                    |

Startup ordering is enforced with healthchecks: the backend waits for
PostgreSQL to pass `pg_isready`, and both frontends wait for the backend's
`/health` endpoint. The backend container applies `prisma migrate deploy`
before starting the server, so a fresh volume is schema-ready automatically.

Override any default by creating a root `.env` file (Compose reads it
automatically and it is git-ignored):

```env
POSTGRES_USER=...
POSTGRES_PASSWORD=...
POSTGRES_DB=educational_notes
JWT_SECRET=...
NEXT_PUBLIC_API_URL=http://localhost:3001
```

The Compose file falls back to development defaults - including a placeholder
`JWT_SECRET` and the `postgres`/`postgres` database credentials - so the stack
boots with zero configuration. Those defaults are for local use only; override
all of them anywhere other than your machine.

Useful commands:

```bash
docker compose logs -f backend          # follow API logs
docker compose ps                       # service + health status
docker compose exec backend sh          # shell into the API container
docker compose down                     # stop (keeps volumes/data)
docker compose down -v                  # stop and DELETE the database volume
```

Each Dockerfile builds with the **repository root** as its context because the
lockfile and workspace manifests live there:

```bash
docker build -f packages/backend/Dockerfile -t educational-notes-backend .
docker build -f packages/student-frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  -t educational-notes-student-frontend .
docker build -f packages/admin-frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  -t educational-notes-admin-frontend .
```

Compose is intended for local development and evaluation. For production, see
below.

---

## 5. Production deployment

### 5.1 Build

Either build the three images (same Dockerfiles, root build context) and push
them to your registry, or build from source on the host:

```bash
npm ci
npm run build --workspace @educational-notes/backend          # tsc -> dist/
npm run build --workspace @educational-notes/student-frontend # next build
npm run build --workspace @educational-notes/admin-frontend   # next build
```

Frontend images must be built once per environment because
`NEXT_PUBLIC_API_URL` is baked in at build time.

### 5.2 Provision

- Managed PostgreSQL 15 with automated backups and point-in-time recovery.
- A dedicated database user limited to the application database.
- TLS termination in front of every service; the platform assumes HTTPS.
- Durable storage for `UPLOAD_DIR`, or object storage - container filesystems
  are ephemeral and note images must survive restarts.

### 5.3 Configure

Inject all variables from section 1 through your platform's secret mechanism.
Checklist:

- `JWT_SECRET` is long, random, and unique per environment. Rotating it
  invalidates all existing sessions.
- `NODE_ENV=production` (disables verbose query logging).
- `CORS_ORIGIN` lists only your real frontend origins - no wildcards.
- `DATABASE_URL` uses TLS (`?sslmode=require`) where the provider supports it.

### 5.4 Release

1. Apply migrations: `npx prisma migrate deploy` against the production
   database, run as a pre-deploy job.
2. Deploy the backend image and wait for `/health` to return `200`.
3. Deploy both frontend images.
4. First deployment only: seed the initial administrator (section 3), sign in
   to the admin panel, and change the password.
5. Smoke test: admin login, create a subject and a note, create a student
   subscription, then confirm the student can read that note and that a third
   device is blocked.

### 5.5 Operate

- Health: poll `GET /health` on the backend for liveness and readiness.
- Scaling: the API is stateless apart from the database, so it scales
  horizontally. Auth rate limiting is stored in-process, so limits apply per
  instance - move it to a shared store (Redis) if you need exact global limits
  across replicas.
- Backups: verify PostgreSQL backups by restoring into a staging database on a
  schedule. Back up `UPLOAD_DIR` alongside the database.
- Rollback: redeploy the previous image tag. Because migrations are applied
  separately, keep each migration compatible with the prior release so a
  rollback does not need a schema change.

---

## 6. Troubleshooting

| Symptom                                              | Likely cause and fix                                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Backend exits with "Missing required environment variables" | `DATABASE_URL` or `JWT_SECRET` not set in the container environment                       |
| `Seeding failed: SEED_ADMIN_PASSWORD is not set`     | Expected guard - pass the password on the seed command                                          |
| Frontend calls `http://localhost:3001` in production | `NEXT_PUBLIC_API_URL` was not provided as a build argument; rebuild the image                    |
| Browser CORS errors                                  | Frontend origin missing from `CORS_ORIGIN`                                                       |
| `compose up` hangs on `backend` as "starting"        | Migrations failed - check `docker compose logs backend`                                          |
| Prisma reports the client is out of date             | Run `npm run prisma:generate --workspace @educational-notes/backend`                             |
