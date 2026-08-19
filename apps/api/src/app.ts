import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { healthResponseSchema } from '@ausfall/contracts';
import { DEFAULT_TENANT_ID, countAll } from '@ausfall/db';
import type { Database } from '@ausfall/db';
import { FakeNotifier } from './adapters/notifier.js';
import { FakeTerminoClient } from './adapters/termino-client.js';
import { isDemoClock, now } from './clock.js';
import { createAbsencesRouter } from './routes/absences.js';

const healthRoute = createRoute({
  method: 'get',
  path: '/healthz',
  summary: 'Health and row counts',
  description: 'Reports that the API can reach the database, and how many rows each table holds.',
  responses: {
    200: {
      description: 'The API is healthy.',
      content: { 'application/json': { schema: healthResponseSchema } },
    },
  },
});

export function createApp(db: Database, tenantId: string = DEFAULT_TENANT_ID): OpenAPIHono {
  const app = new OpenAPIHono();

  app.openapi(healthRoute, async (context) => {
    const counts = await countAll(db, tenantId);
    return context.json(
      { ok: true, now: now().toISOString(), demoClock: isDemoClock(), counts },
      200,
    );
  });

  app.route(
    '/',
    createAbsencesRouter({
      db,
      tenantId,
      termino: new FakeTerminoClient(db, tenantId),
      notifier: new FakeNotifier(),
      now,
    }),
  );

  app.doc('/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Ausfall API', version: '0.0.1' },
  });

  app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Ausfall API' }));

  return app;
}
