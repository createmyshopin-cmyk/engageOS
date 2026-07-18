import { describe, it, expect } from "vitest";
import { ok, created, paginated, errorResponse } from "@/server/http/responses";
import {
  ValidationError,
  UnauthorizedError,
  NotFoundError,
  ServerError,
} from "@/server/core/errors";

const ctx = { correlationId: "corr-123", version: "v1" };

async function body(res: Response): Promise<any> {
  return res.json();
}

describe("response envelopes", () => {
  it("ok() wraps data with meta and ok:true", async () => {
    const res = ok({ hello: "world" }, ctx);
    expect(res.status).toBe(200);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.data).toEqual({ hello: "world" });
    expect(b.meta.correlationId).toBe("corr-123");
    expect(b.meta.version).toBe("v1");
    expect(typeof b.meta.timestamp).toBe("string");
  });

  it("created() is a 201 success envelope", async () => {
    const res = created({ id: "x" }, ctx);
    expect(res.status).toBe(201);
    expect((await body(res)).ok).toBe(true);
  });

  it("paginated() includes the page block", async () => {
    const page = { nextCursor: "abc", hasMore: true, limit: 25 };
    const res = paginated([{ id: 1 }], page, ctx);
    const b = await body(res);
    expect(b.ok).toBe(true);
    expect(b.data).toHaveLength(1);
    expect(b.page).toEqual(page);
  });

  it("errorResponse() maps a ValidationError to 422 with code + details", async () => {
    const err = new ValidationError("Invalid request body", { phone: "required" });
    const res = errorResponse(err, ctx);
    expect(res.status).toBe(422);
    const b = await body(res);
    expect(b.ok).toBe(false);
    expect(b.error.code).toBe("validation_error");
    expect(b.error.details).toEqual({ fields: { phone: "required" } });
    expect(b.meta.correlationId).toBe("corr-123");
  });

  it("maps auth + not-found errors to their statuses", async () => {
    expect(errorResponse(new UnauthorizedError(), ctx).status).toBe(401);
    expect(errorResponse(new NotFoundError("customer"), ctx).status).toBe(404);
  });

  it("hides the message of a non-exposable ServerError", async () => {
    const res = errorResponse(new ServerError("db password leaked into message"), ctx);
    expect(res.status).toBe(500);
    const b = await body(res);
    expect(b.error.code).toBe("server_error");
    expect(b.error.message).not.toContain("password");
  });
});
