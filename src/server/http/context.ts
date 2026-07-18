import "server-only";
import type { NextRequest } from "next/server";
import { adminClient } from "@/lib/db/rpc";
import { TenantRepository } from "@/lib/db/tenant-repository";
import { clientIpFromHeaders } from "@/lib/ip";
import type { Principal } from "@/server/auth/guard";
import { createLogger, newCorrelationId, type Logger } from "@/server/observability/logger";

/**
 * Per-request context threaded from the route wrapper into controllers and
 * services. It is the ONLY object a controller needs: it exposes the
 * authenticated tenant, a request-scoped logger, and (for protected routes) a
 * TenantRepository already bound to the principal's business_id.
 *
 * Nothing here is derived from client-controlled input except the raw ip, which
 * is used for rate-limit bucketing only, never for tenancy.
 */

export interface RequestContext {
  /** Traces this request across all logs. Echoed to the client in meta. */
  correlationId: string;
  /** API version segment, e.g. "v1". */
  version: string;
  /** Best-effort client ip (least-spoofable hop). */
  ip: string;
  logger: Logger;
  /** Present on protected routes; undefined on public ones. */
  principal?: Principal;
}

/** Read or mint a correlation id. Honors an inbound `x-correlation-id` header. */
function resolveCorrelationId(req: NextRequest): string {
  const inbound = req.headers.get("x-correlation-id")?.trim();
  if (inbound && /^[\w-]{8,64}$/.test(inbound)) return inbound;
  return newCorrelationId();
}

/** Build the base context (no principal yet) for a request. */
export function buildContext(req: NextRequest, version: string): RequestContext {
  const correlationId = resolveCorrelationId(req);
  const ip = clientIpFromHeaders(req.headers);
  const logger = createLogger(correlationId, {
    method: req.method,
    path: new URL(req.url).pathname,
    ip,
  });
  return { correlationId, version, ip, logger };
}

/**
 * A TenantRepository bound to the request's principal. This is the sanctioned
 * data-access handle handed to services on protected routes — it auto-scopes
 * every query to `principal.businessId`, so a service cannot forget the tenant
 * filter. Mirrors the merchant-portal `getTenantRepository()` contract but is
 * driven by the API principal rather than a page-level session read.
 */
export function tenantRepositoryFor(principal: Principal): TenantRepository {
  const session = principal.session ?? {
    // API-key principals have no merchant session; synthesize the minimal
    // payload TenantRepository needs (business + actor + role) from the token.
    merchantId: principal.actorId,
    businessId: principal.businessId,
    name: "api",
    email: "",
    role: principal.role,
  };
  return new TenantRepository(adminClient(), session);
}
