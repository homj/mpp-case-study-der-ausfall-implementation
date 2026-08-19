import { z } from 'zod';

/** Row counts the health endpoint reports. One number per table we seed or ingest. */
export const healthCountsSchema = z.object({
  locations: z.int().nonnegative(),
  practitioners: z.int().nonnegative(),
  patients: z.int().nonnegative(),
  prescriptions: z.int().nonnegative(),
  appointments: z.int().nonnegative(),
  terminoExports: z.int().nonnegative(),
  absences: z.int().nonnegative(),
  rescheduleTasks: z.int().nonnegative(),
  outbox: z.int().nonnegative(),
  dataIssues: z.int().nonnegative(),
});
export type HealthCounts = z.infer<typeof healthCountsSchema>;

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  /** Application time. The demo clock makes this a fixed instant. */
  now: z.iso.datetime(),
  demoClock: z.boolean(),
  counts: healthCountsSchema,
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
