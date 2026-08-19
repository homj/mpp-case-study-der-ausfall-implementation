import { migrate } from 'drizzle-orm/postgres-js/migrator';
import type { Database } from './client.js';
import { migrationsFolder } from './paths.js';

/** Applies every pending SQL migration in `packages/db/drizzle`. */
export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}
