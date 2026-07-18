import { defineRoute, NotImplementedError } from "@/server";

/**
 * Auth module — /api/v1/auth
 *
 * SCAFFOLD. The EXISTING cookie-session login/logout flow stays authoritative
 * and is NOT reimplemented here. This surface exposes read-only session
 * introspection for API clients (dashboard, mobile) plus the future API-key
 * lifecycle — issuance tables are deferred per the approved plan.
 *
 * Planned surface:
 *   GET  /api/v1/auth/session          → current principal (kind, businessId, role, scopes)
 *   POST /api/v1/auth/logout           → clear session (delegates to existing flow)
 *   -- deferred: /api/v1/auth/keys (issue/revoke API keys) --
 *
 * The Bearer API-key resolver slots into the auth guard's RESOLVERS chain
 * without any change to controllers; see src/server/auth/guard.ts.
 */

export const GET = defineRoute({
  handler: async ({ ctx }) => {
    // Contract preview: once implemented this returns the authenticated
    // principal. For now the scaffold advertises the shape via 501.
    void ctx;
    throw new NotImplementedError("auth.session is not implemented yet");
  },
});
