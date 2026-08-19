import { connect } from '../client.js';
import { seed } from '../seed.js';

const connection = connect({ max: 1 });
try {
  const result = await seed(connection.db);
  console.log('seed:', JSON.stringify(result));
} finally {
  await connection.close();
}
