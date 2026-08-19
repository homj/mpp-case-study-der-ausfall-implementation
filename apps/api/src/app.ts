import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
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

/**
 * Origins the browser app may call the API from. The web app runs on its own
 * origin, so without this every fetch fails as a CORS error. `WEB_ORIGIN`
 * overrides the list; the defaults cover the dev server and the compose setup.
 * The API holds patient data, so this stays an allow-list, never `*`.
 */
function allowedOrigins(): string[] {
  const configured = process.env.WEB_ORIGIN;
  if (configured !== undefined && configured.trim() !== '') {
    return configured.split(',').map((origin) => origin.trim());
  }
  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
}

export function createApp(db: Database, tenantId: string = DEFAULT_TENANT_ID): OpenAPIHono {
  const app = new OpenAPIHono();

  const origins = allowedOrigins();
  app.use(
    '*',
    cors({
      origin: (origin) => (origins.includes(origin) ? origin : origins[0] ?? null),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['content-type'],
    }),
  );

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
