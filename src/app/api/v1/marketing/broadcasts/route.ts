import { defineRoute, NotImplementedError } from "@/server";

/**
 * Marketing module — /api/v1/marketing
 *
 * SCAFFOLD. Outbound campaigns (WhatsApp via the EXISTING WATI integration,
 * plus future email/SMS). This layer composes: a segment (audience) + a message
 * template + a schedule → a send job. It MUST reuse the WATI outbound flow
 * (sync.ts) and consent state — never message a customer who has opted out.
 *
 * Tenancy: scoped by business_id.
 *
 * Planned surface:
 *   GET  /api/v1/marketing/broadcasts             → list sends
 *   POST /api/v1/marketing/broadcasts             → create/schedule (write scope)
 *   GET  /api/v1/marketing/broadcasts/:id         → status + delivery stats
 *
 * Consent is enforced at send time against the customer consent columns; the
 * whatsappOptOut / channel-revoked state is authoritative and cannot be
 * overridden by this API.
 */

export const GET = defineRoute({
  handler: async () => {
    throw new NotImplementedError("marketing.broadcasts is not implemented yet");
  },
});
