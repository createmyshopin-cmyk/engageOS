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
  totalCount?: number;
  offset?: number;
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
  latestPrizeName: string | null;
  latestCode: string | null;
  rewardCount: number;
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

// ── Analytics performance DTOs (mirror of analytics/dto.ts) ──

export interface CampaignPerformanceDTO {
  campaignId: string;
  campaignName: string;
  status: string;
  totalEvents: number;
  scans: number;
  registrations: number;
  scratches: number;
  redemptions: number;
  lastActivity: string | null;
}

export interface TrafficSourceDTO {
  source: string;
  qrScans: number;
  registrations: number;
  plays: number;
  wins: number;
  redemptions: number;
}

export interface AnalyticsPerformanceDTO {
  campaigns: CampaignPerformanceDTO[];
  sources: TrafficSourceDTO[];
}

export interface DailyActivityDTO {
  day: string;
  registrations: number;
  scratches: number;
  coupons: number;
  redemptions: number;
}

export interface AnalyticsTrendsDTO {
  days: number;
  series: DailyActivityDTO[];
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

// ── Shopify overview DTO (mirror of src/server/modules/shopify/dto.ts) ──

export interface ShopifyOverviewDTO {
  connected: boolean;
  shop: {
    domain: string;
    status: string;
    installedAt: string | null;
    scopes: string | null;
  } | null;
  totals: {
    orders: number;
    products: number;
    revenue: number;
  };
  lastOrderAt: string | null;
}

/** Live granted Admin API scopes (mirror of /api/v1/shopify/scopes). */
export interface ShopifyScopesDTO {
  granted: string[];
  /** True when read live from Shopify; false when falling back to stored scopes. */
  live: boolean;
}

/** One coupon_drop campaign's pool summary + sample codes (/shopify/coupon-drops). */
export interface ShopifyCouponDropDTO {
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  campaign_status: string;
  pool_status: string;
  pool_last_error: string | null;
  shopify_parent_discount_id: string | null;
  currency: string;
  codes_minted: number;
  codes_available: number;
  codes_claimed: number;
  codes_redeemed: number;
  sample_codes: Array<{
    code: string;
    status: string;
    shopify_redeem_code_id: string | null;
    claimed_at: string | null;
    created_at: string;
  }>;
}

export interface ShopifyCouponDropsDTO {
  campaigns: ShopifyCouponDropDTO[];
}

// ── Shopify sync DTOs (mirror of src/server/modules/shopify/sync/dto.ts) ──

export interface ShopifyWebhookThroughputDTO {
  processed: number;
  failed: number;
  total: number;
}

export interface ShopifyActiveJobDTO {
  resource: string;
  status: string;
  processed: number;
  total: number | null;
}

export interface ShopifyConnectionHealthDTO {
  connected: boolean;
  shopDomain: string | null;
  status: string | null;
  installedAt: string | null;
  webhooks24h: ShopifyWebhookThroughputDTO;
  activeJob: ShopifyActiveJobDTO | null;
  lastError: string | null;
}

export interface ShopifyResourceSyncStateDTO {
  resource: string;
  lastSyncedAt: string | null;
  lastStatus: string | null;
  nextSyncAt: string | null;
  totalSynced: number;
  updatedAt: string | null;
}

export interface ShopifySyncJobDTO {
  id: string;
  resource: string;
  mode: string;
  status: string;
  processed: number;
  total: number | null;
  failed: number;
  attempts: number;
  error: string | null;
  triggeredBy: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface ShopifySyncOverviewDTO {
  health: ShopifyConnectionHealthDTO;
  resources: ShopifyResourceSyncStateDTO[];
  recentJobs: ShopifySyncJobDTO[];
}

export interface ShopifyTriggerResultDTO {
  enqueued: Array<{ resource: string; jobId: string | null }>;
  mode: string;
}

// ── Orders DTOs (mirror of src/server/modules/orders/dto.ts) ──

export type OrderCouponFilter = "all" | "with_coupon";

export interface OrderListItemDTO {
  id: string;
  orderNumber: string | null;
  source: string;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  currency: string;
  totalPrice: number;
  totalDiscount: number | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  placedAt: string;
  discountCode: string | null;
  campaignId: string | null;
  campaignName: string | null;
  hasCampaignCoupon: boolean;
}

export interface OrderLineItemDTO {
  id: string;
  title: string | null;
  sku: string | null;
  quantity: number;
  price: number;
  lineTotal: number;
}

export interface OrderDetailDTO extends OrderListItemDTO {
  subtotal: number | null;
  totalTax: number | null;
  items: OrderLineItemDTO[];
}

// ── Products DTOs (mirror of src/server/modules/products/dto.ts) ──

export interface ProductCouponRedemptionDTO {
  orderId: string;
  orderNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  discountCode: string | null;
  placedAt: string;
  quantity: number;
  lineTotal: number;
}

export interface ProductCouponStatsDTO {
  redemptionCount: number;
  customerCount: number;
  quantitySold: number;
  revenue: number;
  lastRedeemedAt: string | null;
  latestDiscountCode: string | null;
  latestCustomerName: string | null;
  recentRedemptions: ProductCouponRedemptionDTO[];
}

export interface ProductCouponSummaryDTO {
  totalProducts: number;
  productsWithCoupons: number;
  totalCouponOrders: number;
  totalCustomers: number;
}

export interface ProductCouponRedemptionsDTO {
  product: ProductListItemDTO | null;
  redemptions: ProductCouponRedemptionDTO[];
}

export type ProductCouponFilter = "all" | "with_coupon" | "without_coupon";
export type ProductStockFilter = "all" | "in_stock" | "low_stock" | "out_of_stock";
export type ProductNewFilter = "all" | "new";
export type ProductSort =
  | "coupon_first"
  | "newest"
  | "oldest"
  | "stock_first"
  | "price_low"
  | "price_high"
  | "name_az"
  | "name_za";
export type ProductStockStatus = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

export interface ProductStockDTO {
  status: ProductStockStatus;
  available: number | null;
}

export interface ProductListItemDTO {
  id: string;
  title: string | null;
  handle: string | null;
  productType: string | null;
  vendor: string | null;
  status: string | null;
  price: number | null;
  imageUrl: string | null;
  createdAt: string;
  isNew: boolean;
  stock: ProductStockDTO;
  couponStats: ProductCouponStatsDTO | null;
}

// ── Loyalty DTO (mirror of src/server/modules/loyalty/dto.ts) ──

export type LoyaltyTier = "bronze" | "silver" | "gold" | "platinum";

export interface LoyaltyOverviewDTO {
  totalLoyaltyMembers: number;
  activeMembers: number;
  totalPointsIssued: number;
  totalPointsRedeemed: number;
  rewardRedemptionRate: number;
  tierCounts: { bronze: number; silver: number; gold: number; platinum: number };
  repeatPurchaseRate: number;
  loyaltyRevenue: number;
  payingCustomers: number;
  avgCustomerSpend: number;
  topCustomerSpend: number;
}

export interface LoyaltyLeaderboardItemDTO {
  rank: number;
  customerId: string;
  name: string | null;
  phone: string;
  tier: LoyaltyTier;
  totalSpend: number;
  totalOrders: number;
  avgOrderValue: number | null;
  lifetimePoints: number;
  lastOrderAt: string | null;
  rfmScore: string | null;
  healthScore: number | null;
  clv: number | null;
}

export interface LoyaltyWalletDTO {
  customerId: string;
  name: string | null;
  phone: string;
  availablePoints: number;
  lifetimePoints: number;
  redeemedPoints: number;
  expiringSoon: number;
  tier: LoyaltyTier;
  tierName: string;
  bonusMultiplier: number;
  updatedAt: string | null;
}

export interface PointsRuleDTO {
  id: string;
  ruleType: string;
  pointsPerUnit: number | null;
  fixedPoints: number | null;
  multiplier: number;
  active: boolean;
}

export interface MembershipTierDTO {
  id: string;
  slug: LoyaltyTier;
  name: string;
  minPoints: number;
  maxPoints: number | null;
  color: string;
  icon: string;
  bonusMultiplier: number;
  benefits: string[];
  sortOrder: number;
}

export interface PointsTransactionDTO {
  id: string;
  txnType: "earn" | "redeem" | "expire" | "adjust";
  source: string;
  delta: number;
  balanceAfter: number;
  note: string | null;
  campaignId: string | null;
  orderId: string | null;
  playId: string | null;
  createdAt: string;
  createdBy: string;
}

export interface LoyaltyProfileDTO {
  customerId: string;
  totalOrders: number;
  totalSpend: number;
  avgOrderValue: number | null;
  totalPlays: number;
  totalWins: number;
  totalRedemptions: number;
  recencyDays: number | null;
  frequency: number;
  monetary: number;
  rfmScore: string | null;
  healthScore: number | null;
  clv: number | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  lastOrderAt: string | null;
  computedAt: string | null;
}

// ── Winners DTO (mirror of src/server/modules/winners/dto.ts) ──

export type WinnerPrizeCategory = "all" | "coupon" | "gift" | "scratch_win";
export type WinnerCampaignScope = "eligible" | "active" | "ended";

export interface WinnerListItemDTO {
  eventId: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  campaignId: string | null;
  campaignName: string | null;
  campaignType: string | null;
  prizeName: string | null;
  prizeType: string | null;
  prizeValue: number | null;
  couponCode: string | null;
  wonAt: string;
  waOptOut: boolean;
}

export interface WinnersSummaryDTO {
  totalWinners: number;
  couponsWon: number;
  giftsWon: number;
  ongoingCampaigns: number;
  prizesInPeriod: number;
  momGrowthPct: number;
  couponsPct: number;
  giftsPct: number;
  winnersToday: number;
  winnersYesterday: number;
}

export interface WinnerListFilters {
  search?: string;
  prizeCategory?: WinnerPrizeCategory;
  campaignId?: string | null;
  campaignScope?: WinnerCampaignScope;
  wonFrom?: string | null;
  wonTo?: string | null;
}


export interface BroadcastListItemDTO {
  id: string;
  channel: "whatsapp";
  name: string;
  templateName: string;
  templateLanguage: string;
  segment: string;
  status: string;
  totalRecipients: number;
  accepted: number;
  rejected: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  createdAt: string;
}
