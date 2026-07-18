"use client";

/**
 * Client-side API contract types for `/api/v1`.
 *
 * These MIRROR the server wire shapes (the `responses.ts` envelope and each
 * module's `dto.ts`) so the dashboard consumes one contract.
 * They are intentionally hand-mirrored rather than imported: the server modules
 * are `import "server-only"` and must never be pulled into a client bundle.
 * Keep this file in sync when a DTO changes — the OpenAPI spec in `openapi/`
 * is the source of truth.
 */

export interface ResponseMeta {
  correlationId: string;
  timestamp: string;
  version: string;
}

export interface PageInfo {
  nextCursor: string | null;
  hasMore: boolean;
  limit: number;
}

export type SuccessBody<T> = {
  ok: true;
  data: T;
  page?: PageInfo;
  meta: ResponseMeta;
};

export type ErrorBody = {
  ok: false;
  error: { code: string; message: string; details?: unknown };
  meta: ResponseMeta;
};

export type ApiBody<T> = SuccessBody<T> | ErrorBody;

// ── Customer DTOs (mirror of src/server/modules/customers/dto.ts) ──

export interface CustomerListItemDTO {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  createdAt: string;
}

export interface CustomerConsents {
  marketing: boolean;
  email: boolean;
  sms: boolean;
  whatsappOptOut: boolean;
}

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
  consents: CustomerConsents;
  createdAt: string;
  updatedAt: string | null;
}

/** The 360 bundle is server-assembled and loosely typed on the wire. */
export type Customer360DTO = Record<string, unknown>;

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

// ── Event DTO (mirror of src/server/modules/events/dto.ts) ──

/** Fixed event-category taxonomy (mirrors EVENT_CATEGORIES in the events validator). */
export const EVENT_CATEGORIES = [
  "commerce",
  "loyalty",
  "campaign",
  "communication",
  "profile",
  "marketing",
  "system",
  "ai",
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export interface EventDTO {
  id: string;
  name: string;
  category: string;
  source: string;
  customerId: string | null;
  campaignId: string | null;
  orderId: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
  createdAt: string;
}

// ── Analytics DTO (mirror of src/server/modules/analytics/dto.ts) ──

export interface AnalyticsOverviewDTO {
  customers: number;
  plays: number;
  wins: number;
  losses: number;
  coupons: number;
  redeemed: number;
  returnVisits: number;
}

// ── Campaign DTOs (mirror of src/server/modules/campaigns/dto.ts) ──

export interface CampaignStatsDTO {
  plays: number;
  wins: number;
  redeemed: number;
  waSent: number;
  remainingCoupons: number;
  winRate: number;
}

export interface CampaignListItemDTO {
  id: string;
  name: string;
  slug: string;
  status: string;
  startsAt: string;
  endsAt: string;
  headline: string | null;
  bannerUrl: string | null;
  logoUrl: string | null;
  createdAt: string;
  stats: CampaignStatsDTO;
}
