import "server-only";
import { NextResponse } from "next/server";
import type { AppError } from "@/server/core/errors";
import { toAppError } from "@/server/core/errors";

/**
 * Standard API response envelope.
 *
 * EVERY /api/v1 endpoint returns this shape — success or failure — so the four
 * client surfaces (dashboard, customer app, mobile, AI) parse one contract.
 * The discriminant is `ok`. `meta.correlationId` ties a response to its server
 * logs; `meta.requestId` echoes any client-supplied idempotency/request id.
 *
 *   Success:  { ok: true,  data, meta }
 *   Page:     { ok: true,  data: T[], page: { nextCursor, hasMore }, meta }
 *   Failure:  { ok: false, error: { code, message, details? }, meta }
 */

export interface ResponseMeta {
  correlationId: string;
  /** ISO timestamp the response was produced. */
  timestamp: string;
  /** API version that served the request, e.g. "v1". */
  version: string;
}

export interface PageInfo {
  /** Opaque cursor for the next page, or null when exhausted. */
  nextCursor: string | null;
  hasMore: boolean;
  /** Echo of the page size actually applied. */
  limit: number;
  /** Total matching rows (offset-paginated endpoints only). */
  totalCount?: number;
  /** Zero-based offset of the current page (offset-paginated endpoints only). */
  offset?: number;
}

export type SuccessBody<T> = {
  ok: true;
  data: T;
  page?: PageInfo;
  meta: ResponseMeta;
};

export type ErrorBody = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  meta: ResponseMeta;
};

export type ApiBody<T> = SuccessBody<T> | ErrorBody;

function meta(correlationId: string, version: string): ResponseMeta {
  return { correlationId, timestamp: new Date().toISOString(), version };
}

interface EnvelopeCtx {
  correlationId: string;
  version: string;
}

/** 200 OK with a data payload. */
export function ok<T>(data: T, ctx: EnvelopeCtx, status = 200): NextResponse<SuccessBody<T>> {
  return NextResponse.json(
    { ok: true, data, meta: meta(ctx.correlationId, ctx.version) },
    { status }
  );
}

/** 201 Created — semantic alias of ok() for resource creation. */
export function created<T>(data: T, ctx: EnvelopeCtx): NextResponse<SuccessBody<T>> {
  return ok(data, ctx, 201);
}

/** 200 OK with a keyset-paginated collection. */
export function paginated<T>(
  items: T[],
  page: PageInfo,
  ctx: EnvelopeCtx
): NextResponse<SuccessBody<T[]>> {
  return NextResponse.json(
    { ok: true, data: items, page, meta: meta(ctx.correlationId, ctx.version) },
    { status: 200 }
  );
}

/** 204 No Content. */
export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/**
 * Serialize any AppError into the error envelope. Non-exposable errors
 * (ServerError) return a generic message; the real cause is logged upstream.
 */
export function errorResponse(err: AppError, ctx: EnvelopeCtx): NextResponse<ErrorBody> {
  const app = toAppError(err);
  const body: ErrorBody = {
    ok: false,
    error: {
      code: app.code,
      message: app.expose ? app.message : "Something went wrong. Please try again.",
      ...(app.details !== undefined ? { details: app.details } : {}),
    },
    meta: meta(ctx.correlationId, ctx.version),
  };
  const res = NextResponse.json(body, { status: app.status });
  // Surface Retry-After for rate limiting so clients can back off correctly.
  const retry = (app as { retryAfterSeconds?: number }).retryAfterSeconds;
  if (typeof retry === "number") res.headers.set("Retry-After", String(retry));
  return res;
}
