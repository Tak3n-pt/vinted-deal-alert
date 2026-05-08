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
    close: async () => {
      db.close();
    }
  };
}

async function openPostgresDatabase(databaseUrl: string): Promise<SqlDatabase> {
  const pool = new pg.Pool({
    connectionString: databaseUrl
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
