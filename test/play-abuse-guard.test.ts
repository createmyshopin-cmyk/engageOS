import { describe, it, expect, vi, beforeEach } from "vitest";

const { checkRateLimit } = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));

import { guardPlayRequest } from "@/lib/play/abuse-guard";

describe("guardPlayRequest", () => {
  beforeEach(() => {
    checkRateLimit.mockReset();
    checkRateLimit.mockResolvedValue(true);
  });

  it("checks IP and per-campaign limits when device id is present", async () => {
    const result = await guardPlayRequest({
      ip: "1.2.3.4",
      merchantSlug: "shop",
      campaignSlug: "onam",
      deviceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    expect(result).toBe("ok");
    expect(checkRateLimit).toHaveBeenCalledWith("play:ip:1.2.3.4", 20);
    expect(checkRateLimit).toHaveBeenCalledWith("play:ipcamp:1.2.3.4:shop:onam", 8);
    expect(checkRateLimit).toHaveBeenCalledWith(
      "play:dev:aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      6
    );
  });

  it("uses stricter IP cap when device id is missing", async () => {
    await guardPlayRequest({
      ip: "1.2.3.4",
      merchantSlug: "shop",
      campaignSlug: "onam",
    });
    expect(checkRateLimit).toHaveBeenCalledWith("play:ip:1.2.3.4", 12);
  });

  it("returns rate_limited when any bucket is full", async () => {
    checkRateLimit.mockImplementation(async (key: string) => !key.startsWith("play:devcamp:"));
    const result = await guardPlayRequest({
      ip: "1.2.3.4",
      merchantSlug: "shop",
      campaignSlug: "onam",
      deviceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    expect(result).toBe("rate_limited");
  });
});
