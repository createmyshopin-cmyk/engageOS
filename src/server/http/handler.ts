import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { authenticate, type Principal } from "@/server/auth/guard";
import { buildContext, type RequestContext } from "@/server/http/context";
import { errorResponse, ok, type SuccessBody } from "@/server/http/responses";
import { AppError, ValidationError, toAppError, type FieldErrors } from "@/server/core/errors";

/**
 * defineRoute — the single wrapper every /api/v1 route handler delegates to.
 *
 * It enforces the layering rule from the spec: a `route.ts` file only wires a
 * validator + controller here; ALL parsing, auth, tenancy, error mapping, and
 * logging live in this framework, and business logic lives in the controller's
 * service. A handler therefore never touches NextResponse, never reads the
 * session directly, and never sees a raw thrown error.
 *
 * Flow: build context → (auth) → parse+validate body/query/params → invoke
 * controller → wrap its return in the success envelope. Any AppError (or
 * unexpected throw) is logged with the correlation id and serialized to the
 * standard error envelope.
 */

export interface HandlerInput<B, Q, P> {
  ctx: RequestContext;
  /** Validated JSON body (only when a `body` schema is supplied). */
  body: B;
  /** Validated query params (only when a `query` schema is supplied). */
  query: Q;
  /** Validated route params (only when a `params` schema is supplied). */
  params: P;
  req: NextRequest;
}

export interface RouteConfig<B, Q, P, R> {
  /** When true (default), the request must authenticate; ctx.principal is set. */
  auth?: boolean;
  /** Zod schema for the JSON body. Omit for GET/DELETE with no body. */
  body?: ZodType<B>;
  /** Zod schema for `searchParams`. Receives a plain object of string values. */
  query?: ZodType<Q>;
  /** Zod schema for the awaited route params object. */
  params?: ZodType<P>;
  /** API version segment for the envelope meta. Defaults to "v1". */
  version?: string;
  /** The controller. Returns plain data; the wrapper envelopes it. */
  handler: (input: HandlerInput<B, Q, P>) => Promise<R | NextResponse>;
}

/**
 * Next 16 passes params as a Promise on the second arg. We type it as
 * `Promise<unknown>` (not `Promise<P>`) so the returned handler stays
 * assignable to Next's generated route validator for BOTH dynamic routes
 * (params inferred as an object) and non-dynamic routes (params `{}`) — a
 * `Promise<undefined>` here would fail the validator's `Promise<{}>` check.
 * The raw params are validated to `P` via the route's Zod schema before use.
 */
type NextRouteCtx = { params: Promise<unknown> };

/** Flatten a ZodError into field → message for the ValidationError envelope. */
function fieldErrors(err: z.ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function validate<T>(schema: ZodType<T> | undefined, value: unknown, label: string): T {
  if (!schema) return undefined as T;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ValidationError(`Invalid ${label}`, fieldErrors(parsed.error));
  }
  return parsed.data;
}

/**
 * Produce a Next.js route handler from a declarative config. Assign the result
 * directly to the exported HTTP method:
 *
 *   export const GET = defineRoute({ auth: true, handler: async ({ ctx }) => ... })
 */
export function defineRoute<B = undefined, Q = undefined, P = undefined, R = unknown>(
  config: RouteConfig<B, Q, P, R>
): (req: NextRequest, next: NextRouteCtx) => Promise<NextResponse> {
  const version = config.version ?? "v1";
  const requiresAuth = config.auth ?? true;

  return async (req: NextRequest, next: NextRouteCtx): Promise<NextResponse> => {
    const ctx = buildContext(req, version);
    const started = Date.now();

    try {
      // ---- Authentication (tenancy is derived here, never from input) ----
      if (requiresAuth) {
        const principal: Principal = await authenticate(req);
        ctx.principal = principal;
        ctx.logger = ctx.logger.child({ businessId: principal.businessId, actor: principal.actorId });
      }

      // ---- Input parsing + validation ----
      let body = undefined as B;
      if (config.body) {
        let json: unknown;
        try {
          json = await req.json();
        } catch {
          throw new ValidationError("Request body must be valid JSON");
        }
        body = validate(config.body, json, "request body");
      }

      const query = config.query
        ? validate(config.query, Object.fromEntries(new URL(req.url).searchParams), "query parameters")
        : (undefined as Q);

      const rawParams = config.params ? await next.params : (undefined as P);
      const params = config.params
        ? validate(config.params, rawParams, "route parameters")
        : (undefined as P);

      // ---- Controller ----
      const result = await config.handler({ ctx, body, query, params, req });

      ctx.logger.info("request.ok", { ms: Date.now() - started });

      // A controller may return a prebuilt NextResponse (e.g. paginated/204);
      // otherwise wrap its plain data in the success envelope.
      if (result instanceof Response) return result as NextResponse;
      return ok(result as R, ctx) as NextResponse<SuccessBody<R>>;
    } catch (err) {
      const app: AppError = toAppError(err);
      const level = app.status >= 500 ? "error" : "warn";
      ctx.logger[level]("request.error", {
        code: app.code,
        status: app.status,
        ms: Date.now() - started,
        err: app.expose ? undefined : app.cause ?? app,
        message: app.message,
      });
      return errorResponse(app, ctx);
    }
  };
}
