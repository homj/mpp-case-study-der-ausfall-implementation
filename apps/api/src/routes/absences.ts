/**
 * HTTP surface for the absence use cases. Every request is validated against a
 * zod schema from `@ausfall/contracts`, and every response is parsed through
 * the same schema before it leaves, so the contract cannot drift (ADR-0002).
 */
import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import {
  absenceListResponseSchema,
  absenceTaskParamsSchema,
  absenceViewSchema,
  acceptProposalRequestSchema,
  contactAttemptRequestSchema,
  createAbsenceRequestSchema,
  createAbsenceResponseSchema,
  dataIssueListResponseSchema,
  errorResponseSchema,
  idParamSchema,
  ingestRequestSchema,
  ingestResponseSchema,
  markKeptResponseSchema,
  practitionerListResponseSchema,
  quickActionResponseSchema,
  rescheduleTaskStateSchema,
} from '@ausfall/contracts';
import {
  ConflictError,
  NotFoundError,
  acceptProposal,
  cancelAndNotify,
  createAbsence,
  getAbsenceView,
  ingestExportFile,
  listAbsenceSummaries,
  listOpenDataIssueViews,
  listPractitionerViews,
  logContactAttempt,
  markKept,
} from '../services/absence-service.js';
import type { AbsenceServiceDeps } from '../services/absence-service.js';

const errorContent = {
  content: { 'application/json': { schema: errorResponseSchema } },
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected error';
}

export function createAbsencesRouter(deps: AbsenceServiceDeps): OpenAPIHono {
  const router = new OpenAPIHono({
    defaultHook: (result, context) => {
      if (!result.success) {
        return context.json({ error: `Invalid request: ${result.error.issues[0]?.message ?? ''}` }, 400);
      }
      return undefined;
    },
  });

  router.openapi(
    createRoute({
      method: 'post',
      path: '/absences',
      summary: 'Record an absence and plan the affected appointments',
      description:
        'Blocks the practitioner in Termino, runs the resolution engine, writes reschedule tasks and outbox rows, then drains the outbox.',
      request: {
        body: { content: { 'application/json': { schema: createAbsenceRequestSchema } } },
      },
      responses: {
        201: {
          description: 'The absence was recorded and planned.',
          content: { 'application/json': { schema: createAbsenceResponseSchema } },
        },
        400: { description: 'The request body is invalid.', ...errorContent },
        404: { description: 'The practitioner does not exist.', ...errorContent },
        409: { description: 'The absence window is not usable.', ...errorContent },
      },
    }),
    async (context) => {
      const body = context.req.valid('json');
      try {
        const result = await createAbsence(deps, {
          practitionerId: body.practitionerId,
          category: body.category,
          startsAt: new Date(body.startsAt),
          endsAt: new Date(body.endsAt),
          note: body.note ?? null,
        });
        return context.json(createAbsenceResponseSchema.parse(result), 201);
      } catch (error) {
        if (error instanceof NotFoundError) return context.json({ error: messageOf(error) }, 404);
        if (error instanceof ConflictError) return context.json({ error: messageOf(error) }, 409);
        throw error;
      }
    },
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/absences',
      summary: 'List recorded absences',
      responses: {
        200: {
          description: 'All absences of the tenant, newest first.',
          content: { 'application/json': { schema: absenceListResponseSchema } },
        },
      },
    }),
    async (context) => {
      const absences = await listAbsenceSummaries(deps);
      return context.json(absenceListResponseSchema.parse({ absences }), 200);
    },
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/absences/{id}',
      summary: 'The front-desk view of one absence',
      description:
        'Reschedule tasks ranked by urgency, their affected appointments with the engine decision, the outbox for this absence, and the open data issues.',
      request: { params: idParamSchema },
      responses: {
        200: {
          description: 'The absence view.',
          content: { 'application/json': { schema: absenceViewSchema } },
        },
        400: { description: 'The id is not a uuid.', ...errorContent },
        404: { description: 'The absence does not exist.', ...errorContent },
        409: { description: 'The absence cannot take the action.', ...errorContent },
      },
    }),
    async (context) => {
      const { id } = context.req.valid('param');
      try {
        const view = await getAbsenceView(deps, id);
        return context.json(absenceViewSchema.parse(view), 200);
      } catch (error) {
        if (error instanceof NotFoundError) return context.json({ error: messageOf(error) }, 404);
        if (error instanceof ConflictError) return context.json({ error: messageOf(error) }, 409);
        throw error;
      }
    },
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/absences/{id}/tasks/{taskId}/contact-attempts',
      summary: 'Record one attempt to reach the patient by phone',
      request: {
        params: absenceTaskParamsSchema,
        body: { content: { 'application/json': { schema: contactAttemptRequestSchema } } },
      },
      responses: {
        200: {
          description: 'The task after the attempt.',
          content: { 'application/json': { schema: rescheduleTaskStateSchema } },
        },
        400: { description: 'The request is invalid.', ...errorContent },
        404: { description: 'The task does not exist.', ...errorContent },
        409: { description: 'The task cannot take the action.', ...errorContent },
      },
    }),
    async (context) => {
      const { taskId } = context.req.valid('param');
      const { reached } = context.req.valid('json');
      try {
        const task = await logContactAttempt(deps, taskId, reached);
        return context.json(rescheduleTaskStateSchema.parse(task), 200);
      } catch (error) {
        if (error instanceof NotFoundError) return context.json({ error: messageOf(error) }, 404);
        if (error instanceof ConflictError) return context.json({ error: messageOf(error) }, 409);
        throw error;
      }
    },
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/absences/{id}/tasks/{taskId}/kept',
      summary: 'The practitioner is available after all: keep the appointments',
      request: { params: absenceTaskParamsSchema },
      responses: {
        200: {
          description: 'How many appointments stayed as booked.',
          content: { 'application/json': { schema: markKeptResponseSchema } },
        },
        400: { description: 'The request is invalid.', ...errorContent },
        404: { description: 'The task does not exist.', ...errorContent },
        409: { description: 'The task cannot take the action.', ...errorContent },
      },
    }),
    async (context) => {
      const { taskId } = context.req.valid('param');
      try {
        const result = await markKept(deps, taskId);
        return context.json(markKeptResponseSchema.parse(result), 200);
      } catch (error) {
        if (error instanceof NotFoundError) return context.json({ error: messageOf(error) }, 404);
        if (error instanceof ConflictError) return context.json({ error: messageOf(error) }, 409);
        throw error;
      }
    },
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/affected-appointments/{id}/accept-proposal',
      summary: 'Book one of the proposed slots',
      request: {
        params: idParamSchema,
        body: { content: { 'application/json': { schema: acceptProposalRequestSchema } } },
      },
      responses: {
        200: {
          description: 'The appointment was rebooked or swapped.',
          content: { 'application/json': { schema: quickActionResponseSchema } },
        },
        400: { description: 'The request is invalid.', ...errorContent },
        404: { description: 'The appointment or the slot does not exist.', ...errorContent },
        409: { description: 'The appointment is already resolved.', ...errorContent },
      },
    }),
    async (context) => {
      const { id } = context.req.valid('param');
      const { slotIndex } = context.req.valid('json');
      try {
        const result = await acceptProposal(deps, id, slotIndex);
        return context.json(quickActionResponseSchema.parse(result), 200);
      } catch (error) {
        if (error instanceof NotFoundError) return context.json({ error: messageOf(error) }, 404);
        if (error instanceof ConflictError) return context.json({ error: messageOf(error) }, 409);
        throw error;
      }
    },
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/affected-appointments/{id}/cancel',
      summary: 'Cancel the appointment and tell the patient',
      request: { params: idParamSchema },
      responses: {
        200: {
          description: 'The appointment was cancelled.',
          content: { 'application/json': { schema: quickActionResponseSchema } },
        },
        400: { description: 'The id is not a uuid.', ...errorContent },
        404: { description: 'The appointment does not exist.', ...errorContent },
        409: { description: 'The appointment is already resolved.', ...errorContent },
      },
    }),
    async (context) => {
      const { id } = context.req.valid('param');
      try {
        const result = await cancelAndNotify(deps, id);
        return context.json(quickActionResponseSchema.parse(result), 200);
      } catch (error) {
        if (error instanceof NotFoundError) return context.json({ error: messageOf(error) }, 404);
        if (error instanceof ConflictError) return context.json({ error: messageOf(error) }, 409);
        throw error;
      }
    },
  );

  router.openapi(
    createRoute({
      method: 'post',
      path: '/exports/ingest',
      summary: 'Ingest the next Termino export and reconcile',
      description:
        'The path is relative to DATA_DIR and defaults to the 08:05 export. Returns what changed and what the reconciliation did.',
      request: {
        body: { content: { 'application/json': { schema: ingestRequestSchema } } },
      },
      responses: {
        200: {
          description: 'The diff of the ingest.',
          content: { 'application/json': { schema: ingestResponseSchema } },
        },
        400: { description: 'The request is invalid.', ...errorContent },
        404: { description: 'The export file is not readable.', ...errorContent },
        409: { description: 'The export cannot be ingested.', ...errorContent },
      },
    }),
    async (context) => {
      const body = context.req.valid('json');
      try {
        const result = await ingestExportFile(deps, body.path);
        return context.json(ingestResponseSchema.parse(result), 200);
      } catch (error) {
        if (error instanceof NotFoundError) return context.json({ error: messageOf(error) }, 404);
        if (error instanceof ConflictError) return context.json({ error: messageOf(error) }, 409);
        throw error;
      }
    },
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/data-issues',
      summary: 'Records the front desk must resolve',
      responses: {
        200: {
          description: 'The open data issues.',
          content: { 'application/json': { schema: dataIssueListResponseSchema } },
        },
      },
    }),
    async (context) => {
      const dataIssues = await listOpenDataIssueViews(deps);
      return context.json(dataIssueListResponseSchema.parse({ dataIssues }), 200);
    },
  );

  router.openapi(
    createRoute({
      method: 'get',
      path: '/practitioners',
      summary: 'Practitioners of the tenant',
      responses: {
        200: {
          description: 'All practitioners.',
          content: { 'application/json': { schema: practitionerListResponseSchema } },
        },
      },
    }),
    async (context) => {
      const practitioners = await listPractitionerViews(deps);
      return context.json(practitionerListResponseSchema.parse({ practitioners }), 200);
    },
  );

  return router;
}
