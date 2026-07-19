import { describe, it, expect } from "vitest";
import { guardPlayRequest } from "@/lib/play/abuse-guard";

describe("guardPlayRequest", () => {
  it("defers limits to play_campaign RPC", async () => {
    const result = await guardPlayRequest({
      ip: "1.2.3.4",
      merchantSlug: "shop",
      campaignSlug: "onam",
      deviceId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    expect(result).toBe("ok");
  });
});
