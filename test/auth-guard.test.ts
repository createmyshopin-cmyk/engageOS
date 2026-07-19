import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// Control what the cookie session resolver sees.
const { getMerchantSession } = vi.hoisted(() => ({ getMerchantSession: vi.fn() }));
vi.mock("@/lib/merchant-session", () => ({ getMerchantSession }));

import { authenticate, requireScope, requireRole } from "@/server/auth/guard";
import { UnauthorizedError, ForbiddenError } from "@/server/core/errors";

function fakeReq(): NextRequest {
  return { headers: { get: () => null } } as unknown as NextRequest;
}

describe("auth guard — tenant isolation & scopes", () => {
  beforeEach(() => getMerchantSession.mockReset());

  it("derives businessId from the session, never from the request", async () => {
    getMerchantSession.mockResolvedValue({
      merchantId: "m-1",
      businessId: "biz-A",
      name: "Owner",
      email: "o@a.com",
      role: "owner",
    });
    const principal = await authenticate(fakeReq);
    expect(principal.businessId).toBe("biz-A");
    expect(principal.actorId).toBe("m-1");
    expect(principal.kind).toBe("merchant");
    // The Principal is the sole trusted tenant source — it carries the session.
    expect(principal.session?.businessId).toBe("biz-A");
  });

  it("throws Unauthorized when there is no session", async () => {
    getMerchantSession.mockResolvedValue(null);
    await expect(authenticate(fakeReq)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("grants owners the wildcard scope", async () => {
    getMerchantSession.mockResolvedValue({
      merchantId: "m", businessId: "b", name: "", email: "", role: "owner",
    });
    const p = await authenticate(fakeReq);
    expect(() => requireScope(p, "write")).not.toThrow();
    expect(() => requireScope(p, "anything")).not.toThrow();
  });

  it("limits staff to read + redeem (no write)", async () => {
    getMerchantSession.mockResolvedValue({
      merchantId: "m", businessId: "b", name: "", email: "", role: "staff",
    });
    const p = await authenticate(fakeReq);
    expect(() => requireScope(p, "read")).not.toThrow();
    expect(() => requireScope(p, "redeem")).not.toThrow();
    expect(() => requireScope(p, "write")).toThrow(ForbiddenError);
  });

  it("limits managers to read + write (no wildcard)", async () => {
    getMerchantSession.mockResolvedValue({
      merchantId: "m", businessId: "b", name: "", email: "", role: "manager",
    });
    const p = await authenticate(fakeReq);
    expect(() => requireScope(p, "write")).not.toThrow();
    expect(() => requireScope(p, "read")).not.toThrow();
  });

  it("requireRole rejects a role not in the allow-list", async () => {
    getMerchantSession.mockResolvedValue({
      merchantId: "m", businessId: "b", name: "", email: "", role: "staff",
    });
    const p = await authenticate(fakeReq);
    expect(() => requireRole(p, "owner")).toThrow(ForbiddenError);
    expect(() => requireRole(p, "owner", "staff")).not.toThrow();
  });
});
