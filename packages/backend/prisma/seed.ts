/**
 * Database seed script - creates the initial administrator account.
 *
 * Usage (from packages/backend):
 *
 *   SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='<strong-password>' npm run db:seed
 *
 * On Windows PowerShell:
 *
 *   $env:SEED_ADMIN_EMAIL='admin@example.com'
 *   $env:SEED_ADMIN_PASSWORD='<strong-password>'
 *   npm run db:seed
 *
 * Behaviour:
 *  - Credentials come from the environment. No password is ever hardcoded here.
 *  - The script fails loudly when SEED_ADMIN_PASSWORD is missing or too short.
 *  - It is idempotent: re-running upserts the same administrator by email, so
 *    it is safe to run on every deployment. Re-running with a different
 *    password rotates the stored hash for that email.
 *  - The password is hashed with bcrypt (cost factor 12) via the shared
 *    hashPassword utility, so seeded admins are indistinguishable from
 *    admins created through the application.
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

import { validateEmail } from '../src/utils/email';
import { hashPassword } from '../src/utils/password';

// Load packages/backend/.env so DATABASE_URL and the seed credentials can be
// supplied from a local env file as well as from real environment variables.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const DEFAULT_ADMIN_EMAIL = 'admin@example.com';

class SeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedError';
  }
}

interface AdminCredentials {
  email: string;
  password: string;
}

/**
 * Reads and validates the initial administrator credentials from the
 * environment.
 * @throws SeedError when the credentials are missing or invalid
 */
export function readAdminCredentials(env: NodeJS.ProcessEnv = process.env): AdminCredentials {
  const email = (env.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const password = env.SEED_ADMIN_PASSWORD ?? '';

  if (password.length === 0) {
    throw new SeedError(
      'SEED_ADMIN_PASSWORD is not set.\n' +
        'Set it to a strong password before seeding, for example:\n' +
        "  SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD='<strong-password>' npm run db:seed\n" +
        'No default password is provided on purpose - see DEPLOYMENT.md.'
    );
  }

  if (password.length < 8) {
    throw new SeedError(
      'SEED_ADMIN_PASSWORD must be at least 8 characters long (platform minimum).'
    );
  }

  if (!validateEmail(email)) {
    throw new SeedError(`SEED_ADMIN_EMAIL is not a valid email address: "${email}"`);
  }

  return { email, password };
}

/**
 * Creates (or updates) the initial administrator account.
 * @param prisma - Prisma client used for the write
 * @param credentials - Validated administrator credentials
 * @returns the administrator id and whether the record already existed
 */
export async function seedAdministrator(
  prisma: PrismaClient,
  credentials: AdminCredentials
): Promise<{ id: string; email: string; alreadyExisted: boolean }> {
  const existing = await prisma.administrator.findUnique({
    where: { email: credentials.email },
    select: { id: true },
  });

  const passwordHash = await hashPassword(credentials.password);

  const administrator = await prisma.administrator.upsert({
    where: { email: credentials.email },
    update: { passwordHash },
    create: { email: credentials.email, passwordHash },
    select: { id: true, email: true },
  });

  return { ...administrator, alreadyExisted: existing !== null };
}

async function main(): Promise<void> {
  const credentials = readAdminCredentials();

  if (!process.env.DATABASE_URL) {
    throw new SeedError(
      'DATABASE_URL is not set. Point it at the target database before seeding.'
    );
  }

  const prisma = new PrismaClient({ log: ['error'] });

  try {
    const result = await seedAdministrator(prisma, credentials);

    if (result.alreadyExisted) {
      console.log(`✔ Administrator "${result.email}" already existed - password hash updated.`);
    } else {
      console.log(`✔ Administrator "${result.email}" created (id: ${result.id}).`);
    }

    console.log('  Sign in at the admin panel and change this password after first use.');
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when executed directly, so the helpers above stay unit-testable.
if (require.main === module) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n✖ Seeding failed: ${message}\n`);
    process.exit(1);
  });
}
