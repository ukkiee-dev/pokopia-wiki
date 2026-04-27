/**
 * Prisma 7 runtime adapter factory.
 *
 * Prisma 7 requires either a driver adapter or an Accelerate URL to be supplied
 * at `new PrismaClient()` construction time. This module encapsulates the
 * `@prisma/adapter-pg` wiring so API / scraper callers can share a single
 * PostgreSQL-backed client without repeating Pool setup.
 *
 * WARNING: Server-side only. Do not import from browser / edge runtimes —
 * `pg` relies on Node's `net` module and will not bundle for the browser.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

import { PrismaClient } from '../prisma-client';

/**
 * Options accepted by {@link createPrismaClient}.
 */
export type CreatePrismaClientOptions = {
  /**
   * Postgres connection string. Falls back to `process.env.DATABASE_URL`
   * when omitted.
   */
  connectionString?: string;
  /**
   * Optional pre-built `pg.Pool` instance. When provided, `connectionString`
   * is ignored and the pool lifecycle is the caller's responsibility.
   */
  pool?: Pool;
};

/**
 * Create a new {@link PrismaClient} wired to a Postgres driver adapter.
 *
 * - If `options.pool` is supplied, it is reused as-is.
 * - Otherwise a fresh `pg.Pool` is constructed from
 *   `options.connectionString` or `process.env.DATABASE_URL`.
 * - Throws when no connection string is resolvable.
 */
export function createPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  const pool =
    options.pool ??
    new Pool({
      connectionString: resolveConnectionString(options.connectionString),
    });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

let cachedClient: PrismaClient | null = null;

/**
 * Return a process-wide singleton {@link PrismaClient}.
 *
 * Constructs the instance on first call using {@link createPrismaClient};
 * subsequent calls return the cached reference. Use
 * {@link resetPrismaClient} to clear the cache (primarily for tests).
 */
export function getPrismaClient(options: CreatePrismaClientOptions = {}): PrismaClient {
  if (cachedClient === null) {
    cachedClient = createPrismaClient(options);
  }
  return cachedClient;
}

/**
 * Clear the cached singleton created by {@link getPrismaClient}.
 *
 * Intended for test teardown only. Callers are responsible for calling
 * `await client.$disconnect()` on the previous instance if the underlying
 * pool must be released.
 */
export function resetPrismaClient(): void {
  cachedClient = null;
}

function resolveConnectionString(explicit?: string): string {
  const resolved = explicit ?? process.env.DATABASE_URL;
  if (!resolved || resolved.length === 0) {
    throw new Error('createPrismaClient: DATABASE_URL is not set and no connectionString was provided.');
  }
  return resolved;
}
