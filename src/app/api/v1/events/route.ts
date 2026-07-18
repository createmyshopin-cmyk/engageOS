import { defineRoute } from "@/server/http/handler";
import { EventController } from "@/server/modules/events/controller";
import { recordEventBody, listEventsQuery } from "@/server/modules/events/validator";

export const runtime = "nodejs";

/** GET /api/v1/events — keyset-paginated, filterable event feed. */
export const GET = defineRoute({
  auth: true,
  query: listEventsQuery,
  handler: ({ ctx, query }) => new EventController(ctx).feed(query),
});

/** POST /api/v1/events — append a universal event (idempotent on dedupKey). */
export const POST = defineRoute({
  auth: true,
  body: recordEventBody,
  handler: ({ ctx, body }) => new EventController(ctx).record(body),
});
