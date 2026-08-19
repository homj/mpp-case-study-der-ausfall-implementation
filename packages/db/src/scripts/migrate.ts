import { connect } from '../client.js';
import { runMigrations } from '../migrate.js';

const connection = connect({ max: 1 });
try {
  await runMigrations(connection.db);
  console.log('migrate: up to date');
} finally {
  await connection.close();
}
