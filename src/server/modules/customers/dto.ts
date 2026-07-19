import "server-only";

/**
 * Customer DTOs — the wire shapes returned to API clients.
 *
 * DTOs are deliberately decoupled from DB row shapes: internal columns
 * (email_normalized, merged_into, raw pointers) never leak, and field names are
 * client-friendly camelCase. Transformers map rows → DTOs in one place so a
 * schema change can't silently change the public contract.
 */

export interface CustomerDTO {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  gender: string | null;
  birthday: string | null;
  anniversary: string | null;
  language: string;
  timezone: string;
  source: string | null;
  consents: {
    marketing: boolean;
    email: boolean;
    sms: boolean;
    whatsappOptOut: boolean;
  };
  createdAt: string;
  updatedAt: string | null;
}

/** A single row in the customer list (lighter than the full profile). */
export interface CustomerListItemDTO {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  latestPrizeName: string | null;
  latestCode: string | null;
  rewardCount: number;
}

/** The customer-360 bundle — profile + analytics + tags + segments + timeline. */
export type Customer360DTO = Record<string, unknown>;

/** A unified timeline entry (funnel log + universal event stream, merged). */
export interface TimelineEntryDTO {
  id: string;
  ts: string;
  kind: "funnel" | "stream";
  name: string;
  category: string;
  campaignId: string | null;
  couponId: string | null;
  payload: Record<string, unknown>;
}
