/**
 * Domain enums as zod schemas. The API and the web app share these.
 * The values mirror the types in `@ausfall/domain`; the glossary in CONTEXT.md
 * explains every term.
 */
import { z } from 'zod';

export const absenceCategorySchema = z.enum(['sick', 'emergency', 'planned', 'other']);
export type AbsenceCategoryContract = z.infer<typeof absenceCategorySchema>;

export const rescheduleTaskStatusSchema = z.enum(['open', 'in_progress', 'retry_contact', 'resolved']);
export type RescheduleTaskStatusContract = z.infer<typeof rescheduleTaskStatusSchema>;

export const resolutionSchema = z.enum([
  'rebooked',
  'swapped',
  'cancelled',
  'kept',
  'completed',
  'aborted',
  'resolved_externally',
]);
export type ResolutionContract = z.infer<typeof resolutionSchema>;

export const serviceCodeSchema = z.enum(['KG', 'MT', 'MLD45', 'KGG']);
export type ServiceCodeContract = z.infer<typeof serviceCodeSchema>;

export const appointmentStatusSchema = z.enum(['booked', 'cancelled']);
export type AppointmentStatusContract = z.infer<typeof appointmentStatusSchema>;

export const outboxKindSchema = z.enum(['termino_write', 'notification']);
export const outboxStatusSchema = z.enum(['pending', 'delivered', 'confirmed', 'failed']);
export const dataIssueKindSchema = z.enum(['unmatched_patient', 'fuzzy_match', 'unknown_practitioner']);
export const dataIssueStatusSchema = z.enum(['open', 'resolved']);
