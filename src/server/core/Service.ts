import "server-only";
import type { RequestContext } from "@/server/http/context";
import type { Logger } from "@/server/observability/logger";

/**
 * Base class for module services.
 *
 * The service is where ALL business logic lives — invariants, orchestration
 * across repositories, event emission, policy checks. It never imports
 * NextResponse and never reads cookies/headers; it operates purely on data +
 * the request context. Services throw AppError subclasses to signal expected
 * failures; the route wrapper maps them to HTTP.
 *
 * A service receives the businessId explicitly (derived by the controller from
 * the principal) so tenancy is an argument, not ambient state — this makes
 * services trivially unit-testable and impossible to mis-scope.
 */
export abstract class Service {
  protected readonly logger: Logger;

  protected constructor(
    protected readonly ctx: RequestContext,
    protected readonly businessId: string
  ) {
    this.logger = ctx.logger.child({ layer: "service", service: new.target.name });
  }
}
