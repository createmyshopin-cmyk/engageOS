import "server-only";
import type { RequestContext } from "@/server/http/context";
import type { Principal } from "@/server/auth/guard";
import { UnauthorizedError } from "@/server/core/errors";

/**
 * Base class for module controllers.
 *
 * A controller is the thin orchestration layer between the route wrapper and a
 * service. It reads validated input + context, calls one or more service
 * methods, and returns plain data (the wrapper envelopes it). Controllers hold
 * NO business rules and issue NO SQL — that is the service's and repository's
 * job respectively. Keeping them uniform makes every module read the same way.
 */
export abstract class Controller {
  protected constructor(protected readonly ctx: RequestContext) {}

  /** The authenticated principal, or throw if this ran on a public route. */
  protected principal(): Principal {
    if (!this.ctx.principal) throw new UnauthorizedError();
    return this.ctx.principal;
  }

  /** The tenant the request acts within — always from the principal. */
  protected get businessId(): string {
    return this.principal().businessId;
  }
}
