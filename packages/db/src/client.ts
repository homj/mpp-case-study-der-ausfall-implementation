import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { schema } from './schema.js';

export const DEFAULT_DATABASE_URL = 'postgres://ausfall:ausfall@localhost:5432/ausfall';
/** The one seeded tenant. Multi-tenant lookup comes later (ADR-0003). */
export const DEFAULT_TENANT_ID = 'meinphysio-plus';
export const DEFAULT_TENANT_NAME = 'meinphysio+';

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export interface Connection {
  db: ReturnType<typeof drizzle<typeof schema>>;
  sql: ReturnType<typeof postgres>;
  close: () => Promise<void>;
}

export function connect(options: { max?: number } = {}): Connection {
  const sql = postgres(databaseUrl(), { max: options.max ?? 10 });
  const db = drizzle(sql, { schema });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}

export type Database = Connection['db'];
