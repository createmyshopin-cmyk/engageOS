import "server-only";
import type { CustomerDTO, CustomerListItemDTO, TimelineEntryDTO } from "@/server/modules/customers/dto";

/**
 * Row → DTO mappers for the customers module. The ONLY place DB shapes become
 * wire shapes, so internal columns never leak and the public contract is
 * changed deliberately, in one file.
 */

/** Full customers row (superset of what we select). */
export interface CustomerRow {
  id: string;
  phone: string;
  name: string | null;
  full_name: string | null;
  email: string | null;
  gender: string | null;
  birthday: string | null;
  anniversary: string | null;
  language: string | null;
  timezone: string | null;
  source: string | null;
  marketing_opt_in: boolean;
  email_opt_in: boolean;
  sms_opt_in: boolean;
  wa_opt_out: boolean | null;
  created_at: string;
  updated_at: string | null;
}

export function toCustomerDTO(row: CustomerRow): CustomerDTO {
  return {
    id: row.id,
    phone: row.phone,
    name: row.full_name ?? row.name,
    email: row.email,
    gender: row.gender,
    birthday: row.birthday,
    anniversary: row.anniversary,
    language: row.language ?? "en",
    timezone: row.timezone ?? "Asia/Kolkata",
    source: row.source,
    consents: {
      marketing: !!row.marketing_opt_in,
      email: !!row.email_opt_in,
      sms: !!row.sms_opt_in,
      whatsappOptOut: !!row.wa_opt_out,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CustomerListRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  created_at: string;
}

export function toListItemDTO(row: CustomerListRow): CustomerListItemDTO {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
  };
}

/** Row shape returned by customer_timeline_unified. */
export interface TimelineRow {
  id: string;
  ts: string;
  kind: string;
  name: string;
  category: string;
  ref_campaign: string | null;
  ref_coupon: string | null;
  payload: Record<string, unknown> | null;
}

export function toTimelineEntryDTO(row: TimelineRow): TimelineEntryDTO {
  return {
    id: row.id,
    ts: row.ts,
    kind: row.kind === "funnel" ? "funnel" : "stream",
    name: row.name,
    category: row.category,
    campaignId: row.ref_campaign,
    couponId: row.ref_coupon,
    payload: row.payload ?? {},
  };
}
