import { describe, it, expect } from "vitest";
import {
  toBroadcastListItemDTO,
  type BroadcastListRow,
} from "@/server/modules/marketing/dto";

/**
 * Phase 9 (Marketing, read-only) — pure transformer logic for the broadcast
 * ledger projection. The listing itself is exercised against the live DB; here
 * we pin the snake→camel reshape, numeric coercion, and the fixed channel tag.
 */

describe("broadcast list item DTO", () => {
  it("maps a ledger row to camelCase and coerces counters to numbers", () => {
    const row: BroadcastListRow = {
      id: "b-1",
      name: "Onam Sale",
      template_name: "onam_offer",
      template_language: "ml",
      segment: "all",
      status: "sent",
      total_recipients: "500" as unknown as number, // counters can arrive as strings
      accepted: 480,
      rejected: 20,
      sent_count: 480,
      delivered_count: 450,
      read_count: 300,
      failed_count: 5,
      created_at: "2026-07-18T09:00:00.000Z",
    };
    expect(toBroadcastListItemDTO(row)).toEqual({
      id: "b-1",
      channel: "whatsapp",
      name: "Onam Sale",
      templateName: "onam_offer",
      templateLanguage: "ml",
      segment: "all",
      status: "sent",
      totalRecipients: 500,
      accepted: 480,
      rejected: 20,
      sent: 480,
      delivered: 450,
      read: 300,
      failed: 5,
      createdAt: "2026-07-18T09:00:00.000Z",
    });
  });

  it("zero-normalizes null counters", () => {
    const row: BroadcastListRow = {
      id: "b-2",
      name: "Draft blast",
      template_name: "tpl",
      template_language: "en",
      segment: "winners",
      status: "sending",
      total_recipients: null,
      accepted: null,
      rejected: null,
      sent_count: null,
      delivered_count: null,
      read_count: null,
      failed_count: null,
      created_at: "2026-07-18T09:00:00.000Z",
    };
    const dto = toBroadcastListItemDTO(row);
    expect(dto.totalRecipients).toBe(0);
    expect(dto.delivered).toBe(0);
    expect(dto.failed).toBe(0);
    expect(dto.channel).toBe("whatsapp");
  });
});
