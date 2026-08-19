import type { Config } from 'drizzle-kit';

const DEFAULT_DATABASE_URL = 'postgres://ausfall:ausfall@localhost:5432/ausfall';

export default {
  schema: './src/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL },
} satisfies Config;
