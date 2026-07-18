import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  parseListQuery,
  buildPage,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from "@/server/http/pagination";
import { ValidationError } from "@/server/core/errors";

describe("cursor pagination", () => {
  it("round-trips encode∘decode as identity", () => {
    const cursor = { ts: "2026-07-17T10:20:30.000Z", id: "11111111-2222-3333-4444-555555555555" };
    const token = encodeCursor(cursor);
    expect(token).not.toContain(" "); // opaque, url-safe
    expect(decodeCursor(token)).toEqual(cursor);
  });

  it("rejects a tampered / foreign cursor", () => {
    expect(() => decodeCursor("not-a-real-cursor!!")).toThrow(ValidationError);
    // Right base64url shape, wrong internal version.
    const bogus = Buffer.from("9 2026-07-17T00:00:00Z abc", "utf8").toString("base64url");
    expect(() => decodeCursor(bogus)).toThrow(ValidationError);
    // Non-parseable timestamp.
    const badTs = Buffer.from("1 not-a-date abc", "utf8").toString("base64url");
    expect(() => decodeCursor(badTs)).toThrow(ValidationError);
  });

  it("clamps limit to the max and defaults when absent", () => {
    expect(parseListQuery(new URLSearchParams("")).limit).toBe(DEFAULT_PAGE_LIMIT);
    expect(parseListQuery(new URLSearchParams("limit=1000")).limit).toBe(MAX_PAGE_LIMIT);
    expect(parseListQuery(new URLSearchParams("limit=10")).limit).toBe(10);
  });

  it("rejects a non-positive limit and an unwhitelisted sort", () => {
    expect(() => parseListQuery(new URLSearchParams("limit=0"))).toThrow(ValidationError);
    expect(() => parseListQuery(new URLSearchParams("limit=-3"))).toThrow(ValidationError);
    expect(() =>
      parseListQuery(new URLSearchParams("sort=password"), { sortable: ["created_at"] })
    ).toThrow(ValidationError);
  });

  it("only surfaces whitelisted equality filters", () => {
    const q = parseListQuery(new URLSearchParams("status=active&evil=1"), { filterable: ["status"] });
    expect(q.filters).toEqual({ status: "active" });
  });

  it("buildPage detects a further page from the limit+1 sentinel row", () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      ts: `2026-07-17T00:00:0${i}.000Z`,
      id: `id-${i}`,
    }));
    const { items, page } = buildPage(rows, 5, (r) => ({ ts: r.ts, id: r.id }));
    expect(items).toHaveLength(5);
    expect(page.hasMore).toBe(true);
    expect(page.limit).toBe(5);
    expect(page.nextCursor).not.toBeNull();
    // The cursor points at the last returned row, so the next page resumes there.
    expect(decodeCursor(page.nextCursor!)).toEqual({ ts: rows[4].ts, id: rows[4].id });
  });

  it("buildPage returns a null cursor when the slice is the last page", () => {
    const rows = [{ ts: "2026-07-17T00:00:00.000Z", id: "only" }];
    const { items, page } = buildPage(rows, 5, (r) => ({ ts: r.ts, id: r.id }));
    expect(items).toHaveLength(1);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
