import "server-only";

/**
 * Domain error taxonomy for the Enterprise API.
 *
 * Business logic (services) and the framework throw these instead of ad-hoc
 * `throw new Error(...)`. The route handler wrapper (`defineRoute`) is the ONLY
 * place that maps them to an HTTP envelope, so controllers/services never touch
 * NextResponse. Every AppError carries a stable machine `code` (documented in
 * API_ARCHITECTURE.md) so clients can branch on `code`, not on message text.
 */

export type ApiErrorCode =
  | "validation_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "unprocessable"
  | "not_implemented"
  | "server_error";

/** HTTP status paired with each code. Single source of truth for the mapping. */
const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  validation_error: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  unprocessable: 422,
  not_implemented: 501,
  server_error: 500,
};

/** Per-field validation messages, keyed by the offending field path. */
export type FieldErrors = Record<string, string>;

/**
 * Base class for every expected (non-bug) failure surfaced to a client.
 * `details` is an optional, client-safe structured payload (e.g. field errors,
 * a conflicting id) — never put secrets or internals here.
 */
export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** When true, the message is safe to show a client verbatim. */
  readonly expose: boolean;

  constructor(
    code: ApiErrorCode,
    message: string,
    opts: { details?: unknown; expose?: boolean } = {}
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = opts.details;
    this.expose = opts.expose ?? true;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", fields?: FieldErrors) {
    super("validation_error", message, { details: fields ? { fields } : undefined });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super("unauthorized", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super("forbidden", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super("not_found", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "The request conflicts with the current state", details?: unknown) {
    super("conflict", message, { details });
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests", public readonly retryAfterSeconds?: number) {
    super("rate_limited", message);
  }
}

export class NotImplementedError extends AppError {
  constructor(message = "This endpoint is not implemented yet") {
    super("not_implemented", message);
  }
}

/**
 * Unexpected server fault. The `cause` is logged with the correlation id but
 * NEVER exposed — clients only see a generic message so internals don't leak.
 */
export class ServerError extends AppError {
  constructor(message = "Something went wrong", cause?: unknown) {
    super("server_error", message, { expose: false });
    if (cause !== undefined) this.cause = cause;
  }
}

/** Narrow an unknown thrown value to an AppError, wrapping anything else. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  return new ServerError("Unhandled error", err);
}
