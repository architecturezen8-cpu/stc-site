import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNodePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { ensureSiteEnv } from "@/lib/env-bootstrap";

// Self-healing: if the sandbox wiped the Supabase block from .env, restore
// the keys from .env.supabase-backup BEFORE the URL is read below.
ensureSiteEnv();

/**
 * Dual-driver database client.
 *
 * - `postgres://…` / `postgresql://…` DATABASE_URL → a real PostgreSQL server
 *   through drizzle-orm/node-postgres (Supabase Phase 2.2). node-postgres was
 *   chosen over postgres-js because drizzle's `execute()` returns the same
 *   `{ rows, fields }` result shape as the PGlite driver, so every call site
 *   stays source-compatible.
 * - `pglite:<dir>` / `file:<dir>` / unset → the embedded PGlite database
 *   (original development mode + rollback source; data lives in .data/pglite).
 */
export type Db = NodePgDatabase;

// SITE_DATABASE_URL wins over DATABASE_URL on purpose: the sandbox init
// exports a legacy `DATABASE_URL=file:…` globally, and environment variables
// always beat .env files — so the real connection string needs its own name
// that nothing else in the environment can shadow. ensureSiteEnv() (above)
// restores it from the backup files when the sandbox rewrote .env.
const rawUrl = (
  process.env.SITE_DATABASE_URL ||
  process.env.DATABASE_URL ||
  ""
).trim();
const isPostgres = /^postgres(ql)?:\/\//.test(rawUrl);

function resolvePgliteDir(): string {
  if (rawUrl.startsWith("pglite:")) return rawUrl.slice("pglite:".length);
  if (rawUrl.startsWith("file:")) return rawUrl.slice("file:".length);
  return path.join(process.cwd(), ".data", "pglite");
}

const globalForDb = globalThis as typeof globalThis & {
  __schoolPglite?: PGlite;
  __schoolPool?: Pool;
};

function getPglite(): PGlite {
  if (!globalForDb.__schoolPglite) {
    const dataDir = resolvePgliteDir();
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    globalForDb.__schoolPglite = new PGlite(dataDir);
  }
  return globalForDb.__schoolPglite;
}

function getPool(): Pool {
  if (!globalForDb.__schoolPool) {
    const isSupabase = /supabase\.(co|com)/.test(rawUrl);
    globalForDb.__schoolPool = new Pool({
      connectionString: rawUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      // Supabase poolers present a Supavisor certificate chain — the strict
      // default CA check fails there, so relax it for these known hosts.
      ...(isSupabase ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return globalForDb.__schoolPool;
}

/** Embedded PGlite client — undefined while running against a real PostgreSQL server. */
export const client: PGlite | undefined = isPostgres ? undefined : getPglite();

/** node-postgres pool — undefined while running in embedded PGlite mode. */
export const pool: Pool | undefined = isPostgres ? getPool() : undefined;

export const db: Db = (isPostgres
  ? drizzleNodePg(getPool())
  : drizzlePglite(getPglite())) as unknown as Db;
