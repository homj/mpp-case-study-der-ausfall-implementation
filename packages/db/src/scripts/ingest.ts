import { resolve } from 'node:path';
import { connect } from '../client.js';
import { ingestExport } from '../ingest.js';

const [, , fileArgument] = process.argv;
if (fileArgument === undefined) {
  console.error('usage: pnpm --filter @ausfall/db ingest <path-to-export.json>');
  process.exit(1);
}

const connection = connect({ max: 1 });
try {
  const result = await ingestExport(connection.db, resolve(fileArgument));
  console.log('ingest:', JSON.stringify(result));
} finally {
  await connection.close();
}
