/**
 * One-command start: apply migrations, seed master data, ingest the 08:00
 * export if it is not in yet, then listen. Every step is idempotent, so a
 * restart is safe.
 */
import { serve } from '@hono/node-server';
import { DEFAULT_TENANT_ID, connect, dataFile, ingestExport, runMigrations, seed } from '@ausfall/db';
import { createApp } from './app.js';
import { isDemoClock, now } from './clock.js';

const FIRST_EXPORT = 'termino_export_2026-09-07_0800.json';
const port = Number.parseInt(process.env.PORT ?? '4000', 10);

const connection = connect();

await runMigrations(connection.db);
console.log('start: migrations applied');

const seeded = await seed(connection.db, DEFAULT_TENANT_ID);
console.log('start: seeded', JSON.stringify(seeded));

const ingested = await ingestExport(connection.db, dataFile(FIRST_EXPORT), DEFAULT_TENANT_ID);
console.log(
  ingested.skipped
    ? `start: export ${ingested.exportId} already ingested`
    : `start: ingested ${JSON.stringify(ingested)}`,
);

const app = createApp(connection.db, DEFAULT_TENANT_ID);

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`start: listening on http://0.0.0.0:${info.port}`);
  console.log(`start: application time ${now().toISOString()} (demo clock: ${isDemoClock()})`);
});

async function shutdown(): Promise<void> {
  await connection.close();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
