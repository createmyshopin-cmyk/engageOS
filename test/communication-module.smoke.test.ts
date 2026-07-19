import { describe, it, expect } from "vitest";
import {
  CommunicationPriority,
  resolveCommunicationPriority,
} from "@/lib/communication/priority";
import {
  assistantPlanSchema,
  inactiveParamsSchema,
  confirmBroadcastSchema,
} from "@/lib/ai-gateway/assistant/schema";

describe("communication priority", () => {
  it("assigns critical priority to coupon.redeemed", () => {
    expect(resolveCommunicationPriority("coupon.redeemed")).toBe(
      CommunicationPriority.CRITICAL
    );
  });

  it("assigns bulk priority to customer.inactive", () => {
    expect(resolveCommunicationPriority("customer.inactive")).toBe(
      CommunicationPriority.BULK
    );
  });

  it("clamps override values to 0–100", () => {
    expect(resolveCommunicationPriority("unknown.event", 150)).toBe(100);
    expect(resolveCommunicationPriority("unknown.event", -5)).toBe(0);
  });

  it("defaults unknown events to NORMAL", () => {
    expect(resolveCommunicationPriority("custom.event")).toBe(
      CommunicationPriority.NORMAL
    );
  });
});

describe("AI assistant schema", () => {
  it("parses a valid assistant plan", () => {
    const plan = assistantPlanSchema.parse({
      reply: "Found 3 inactive customers.",
      action: "list_inactive_customers",
      params: { inactiveDays: 60, limit: 10 },
    });
    expect(plan.action).toBe("list_inactive_customers");
    expect(plan.params.inactiveDays).toBe(60);
  });

  it("allows null action for conversational replies", () => {
    const plan = assistantPlanSchema.parse({
      reply: "Hello! How can I help?",
      action: null,
    });
    expect(plan.action).toBeNull();
  });

  it("validates inactive customer params", () => {
    const params = inactiveParamsSchema.parse({ inactiveDays: "60", limit: "5" });
    expect(params.inactiveDays).toBe(60);
    expect(params.limit).toBe(5);
  });

  it("rejects broadcast confirm without template", () => {
    expect(() =>
      confirmBroadcastSchema.parse({
        proposalToken: "short",
        templateName: "",
      })
    ).toThrow();
  });
});

describe("assistant JSON extraction (logic mirror)", () => {
  function extractJsonObject(text: string): unknown {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() ?? text.trim();
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no json");
    return JSON.parse(candidate.slice(start, end + 1));
  }

  it("extracts JSON from fenced blocks", () => {
    const raw = extractJsonObject('```json\n{"reply":"hi","action":null}\n```');
    expect(raw).toEqual({ reply: "hi", action: null });
  });

  it("extracts JSON from plain text", () => {
    const raw = extractJsonObject('Sure! {"reply":"ok","action":"get_analytics_overview","params":{}}');
    expect((raw as { action: string }).action).toBe("get_analytics_overview");
  });
});
