import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import pg from "pg";

export type SqlDialect = "sqlite" | "postgres";

export interface SqlRunResult {
  changes: number;
  lastInsertRowid?: number | bigint;
}

export interface SqlDatabase {
  dialect: SqlDialect;
  exec(sql: string): Promise<void>;
  run(sql: string, params?: unknown[]): Promise<SqlRunResult>;
  get(sql: string, params?: unknown[]): Promise<Record<string, unknown> | undefined>;
  all(sql: string, params?: unknown[]): Promise<Array<Record<string, unknown>>>;
  insert(sql: string, params?: unknown[], idColumn?: string): Promise<number>;
  transaction(run: () => Promise<void>): Promise<void>;
  close(): Promise<void>;
}

interface SqliteDatabaseSync {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number; lastInsertRowid?: number | bigint };
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
  };
  close(): void;
}

export async function openSqlDatabase(databasePath: string): Promise<SqlDatabase> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) return openPostgresDatabase(databaseUrl);
  return openSqliteDatabase(databasePath);
}

async function openSqliteDatabase(databasePath: string): Promise<SqlDatabase> {
  const fullPath = resolve(databasePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  const sqlite = (await import("node:sqlite")) as {
    DatabaseSync: new (path: string) => SqliteDatabaseSync;
  };
  const db = new sqlite.DatabaseSync(fullPath);
  // WAL lets the dashboard read while the bot writes; busy_timeout avoids
  // SQLITE_BUSY when both processes (or the dashboard + bot in the same
  // process) hit the file at the same time.
  db.exec("pragma journal_mode = WAL; pragma synchronous = NORMAL; pragma busy_timeout = 5000; pragma foreign_keys = ON;");
  return {
    dialect: "sqlite",
    exec: async (sql) => {
      db.exec(sql);
    },
    run: async (sql, params = []) => db.prepare(sql).run(...params),
    get: async (sql, params = []) => normalizeRow(db.prepare(sql).get(...params)),
    all: async (sql, params = []) => db.prepare(sql).all(...params).map((row) => normalizeRow(row)),
    insert: async (sql, params = []) => {
      const result = db.prepare(sql).run(...params);
      return Number(result.lastInsertRowid ?? 0);
    },
    transaction: async (run) => {
      db.exec("begin immediate");
      try {
        await run();
        db.exec("commit");
      } catch (error) {
        try { db.exec("rollback"); } catch { /* ignore rollback errors */ }
        throw error;
      }
    },
    close: async () => {
      db.close();
    }
  };
}

async function openPostgresDatabase(databaseUrl: string): Promise<SqlDatabase> {
  // Managed Postgres providers (Supabase pooler, RDS, Heroku) require TLS but
  // present certs Node doesn't validate against its default CA bundle. Disable
  // strict cert verification — connection is still encrypted, just unpinned.
  // Skip TLS for localhost/private dev databases.
  const isLocal = /\b(localhost|127\.0\.0\.1)\b/.test(databaseUrl);
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: isLocal ? false : { rejectUnauthorized: false }
  });

  return {
    dialect: "postgres",
    exec: async (sql) => {
      await pool.query(sql);
    },
    run: async (sql, params = []) => {
      const result = await pool.query(convertPlaceholders(sql), params);
      return { changes: result.rowCount ?? 0 };
    },
    get: async (sql, params = []) => {
      const result = await pool.query(convertPlaceholders(sql), params);
      return normalizeRow(result.rows[0]);
    },
    all: async (sql, params = []) => {
      const result = await pool.query(convertPlaceholders(sql), params);
      return result.rows.map((row) => normalizeRow(row));
    },
    insert: async (sql, params = [], idColumn = "id") => {
      const result = await pool.query(`${convertPlaceholders(sql)} returning ${idColumn}`, params);
      const value = result.rows[0]?.[idColumn];
      return Number(value ?? 0);
    },
    transaction: async (run) => {
      // Wrapping pool-based queries in a transaction would require routing every
      // statement through a dedicated client. Until the rest of the API supports
      // that, callers fall back to autocommit for the postgres dialect — the
      // transaction wrapper is primarily a sqlite write-batching speed-up.
      await run();
    },
    close: async () => {
      await pool.end();
    }
  };
}

function convertPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown>;
function normalizeRow(row: Record<string, unknown> | undefined): Record<string, unknown> | undefined;
function normalizeRow(row: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!row) return undefined;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    normalized[key] = value instanceof Date ? value.toISOString() : value;
  }
  return normalized;
}
