import "server-only";

/**
 * Enterprise API framework — public surface.
 *
 * Modules import from here (`@/server`) rather than reaching into individual
 * files, so the framework's internal layout can evolve without touching module
 * code. See API_ARCHITECTURE.md for how the pieces fit together.
 */

// HTTP layer
export { defineRoute } from "@/server/http/handler";
export type { HandlerInput, RouteConfig } from "@/server/http/handler";
export {
  ok,
  created,
  paginated,
  noContent,
  errorResponse,
} from "@/server/http/responses";
export type { ApiBody, SuccessBody, ErrorBody, PageInfo, ResponseMeta } from "@/server/http/responses";
export {
  parseListQuery,
  buildPage,
  encodeCursor,
  decodeCursor,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from "@/server/http/pagination";
export type { ListQuery, Cursor, SortDirection, ParseListOptions } from "@/server/http/pagination";
export { buildContext, tenantRepositoryFor } from "@/server/http/context";
export type { RequestContext } from "@/server/http/context";

// Auth
export { authenticate, requireScope, requireRole } from "@/server/auth/guard";
export type { Principal, PrincipalKind, AuthResolver } from "@/server/auth/guard";

// Core
export { Controller } from "@/server/core/Controller";
export { Service } from "@/server/core/Service";
export { Repository } from "@/server/core/Repository";
export {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitedError,
  NotImplementedError,
  ServerError,
  toAppError,
} from "@/server/core/errors";
export type { ApiErrorCode, FieldErrors } from "@/server/core/errors";

// Observability
export { createLogger, newCorrelationId } from "@/server/observability/logger";
export type { Logger, LogLevel, LogFields } from "@/server/observability/logger";
