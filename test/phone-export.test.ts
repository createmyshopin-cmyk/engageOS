import { describe, expect, it } from "vitest";
import { parsePhoneForExport, spreadsheetTextValue } from "@/lib/phone-export";
import { buildCustomersCsv } from "@/server/modules/customers/csv";

describe("parsePhoneForExport", () => {
  it("normalizes +91 E.164", () => {
    expect(parsePhoneForExport("+919876543210")).toEqual({
      mobile10: "9876543210",
      e164: "+919876543210",
      whatsapp: "919876543210",
    });
  });

  it("normalizes bare 10-digit mobile", () => {
    expect(parsePhoneForExport("98765 43210")).toEqual({
      mobile10: "9876543210",
      e164: "+919876543210",
      whatsapp: "919876543210",
    });
  });

  it("normalizes 91 prefix without plus", () => {
    expect(parsePhoneForExport("919876543210")).toEqual({
      mobile10: "9876543210",
      e164: "+919876543210",
      whatsapp: "919876543210",
    });
  });

  it("returns null for invalid numbers", () => {
    expect(parsePhoneForExport("12345")).toBeNull();
  });
});

describe("buildCustomersCsv", () => {
  it("exports mobile and +91 columns as Excel-safe text", () => {
    const csv = buildCustomersCsv([
      {
        name: "Priya",
        phone: "9876543210",
        email: null,
        createdAt: "2026-01-15T10:00:00.000Z",
        latestCode: "SAVE-ABCD",
        latestPrizeName: "10% off",
        rewardCount: 1,
      },
    ]);

    expect(csv).toContain("Mobile,Phone (+91),WhatsApp");
    expect(csv).toContain("\t9876543210");
    expect(csv).toContain("\t+919876543210");
    expect(csv).toContain("\t919876543210");
    expect(spreadsheetTextValue("9876543210")).toBe("\t9876543210");
  });
});
