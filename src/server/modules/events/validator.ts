import { z } from "zod";

/**
 * Validators for the events module. The universal event stream is the CDP
 * backbone: every module writes durable events here via record_event. Category
 * is a fixed taxonomy (matches the DB CHECK); event_name is a free-form dotted
 * verb. dedupKey makes ingestion idempotent — re-posting the same key is a
 * no-op that returns the original event id.
 */

export const EVENT_CATEGORIES = [
  "commerce",
  "loyalty",
  "campaign",
  "communication",
  "profile",
  "marketing",
  "system",
  "ai",
] as const;

/** Body for POST /api/v1/events. */
export const recordEventBody = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z][a-z0-9_.-]*$/i, "Event name must be a dotted verb, e.g. order.placed"),
  category: z.enum(EVENT_CATEGORIES),
  customerId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  source: z.string().trim().max(40).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  dedupKey: z.string().trim().max(200).optional(),
  occurredAt: z.string().datetime().optional(),
});
export type RecordEventBody = z.infer<typeof recordEventBody>;

/** Query for GET /api/v1/events. */
export const listEventsQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  category: z.enum(EVENT_CATEGORIES).optional(),
  name: z.string().trim().max(80).optional(),
  customerId: z.string().uuid().optional(),
});
export type ListEventsQuery = z.infer<typeof listEventsQuery>;
