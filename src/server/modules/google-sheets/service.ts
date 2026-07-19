import "server-only";
import { Service } from "@/server/core/Service";
import type { RequestContext } from "@/server/http/context";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import { buildPage, type Cursor } from "@/server/http/pagination";
import { CustomerRepository } from "@/server/modules/customers/repository";
import { toListItemDTO } from "@/server/modules/customers/transformer";
import type {
  SheetsCampaignPlayerExportDTO,
  SheetsCampaignSummaryExportDTO,
  SheetsCouponExportDTO,
  SheetsCustomerExportDTO,
  SheetsExportRow,
} from "@/server/modules/google-sheets/dto";
import {
  CouponExportRepository,
  FeedExportRepository,
  type CampaignPlayerExportRow,
  type CampaignSummaryExportRow,
  type CouponExportRow,
  type TagCustomerExportRow,
} from "@/server/modules/google-sheets/repository";
import type { SheetsExportQuery } from "@/server/modules/google-sheets/validator";
import { touchLastSync } from "@/lib/google-sheets/store";

function toSheetsCustomerDTO(row: ReturnType<typeof toListItemDTO>, tags?: string | null): SheetsCustomerExportDTO {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    joinedOn: row.createdAt.slice(0, 10),
    latestCouponCode: row.latestCode,
    latestPrize: row.latestPrizeName,
    totalRewards: row.rewardCount,
    tags: tags ?? null,
  };
}

function tagRowToDto(row: TagCustomerExportRow): SheetsCustomerExportDTO {
  return toSheetsCustomerDTO(
    {
      id: row.id,
      phone: row.phone,
      name: row.name,
      email: row.email,
      createdAt: row.created_at,
      latestPrizeName: row.latest_prize_name,
      latestCode: row.latest_code,
      rewardCount: Number(row.reward_count) || 0,
    },
    row.tags
  );
}

function campaignPlayerToDto(row: CampaignPlayerExportRow): SheetsCampaignPlayerExportDTO {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    joinedOn: row.created_at.slice(0, 10),
    campaignName: row.campaign_name,
    prizeName: row.prize_name,
    code: row.code,
    couponStatus: row.coupon_status,
    playedAt: row.played_at,
  };
}

function campaignSummaryToDto(row: CampaignSummaryExportRow): SheetsCampaignSummaryExportDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    plays: Number(row.plays) || 0,
    wins: Number(row.wins) || 0,
    redeemed: Number(row.redeemed) || 0,
    remainingCoupons: Number(row.remaining_coupons) || 0,
  };
}

function toSheetsCouponDTO(row: CouponExportRow): SheetsCouponExportDTO {
  return {
    id: row.id,
    code: row.code,
    status: row.status,
    prizeName: row.prize_name,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    shopifyLinked: !!row.shopify_linked,
    shopifyCodeId: row.shopify_discount_code_id,
    source: row.source,
    createdAt: row.created_at,
    redeemedAt: row.redeemed_at,
    expiresAt: row.expires_at,
  };
}

function joinedDaysFromQuery(joined?: string): number | null {
  switch (joined) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    default:
      return null;
  }
}

export class GoogleSheetsExportService extends Service {
  private readonly customers: CustomerRepository;
  private readonly coupons: CouponExportRepository;
  private readonly feeds: FeedExportRepository;

  constructor(ctx: RequestContext, businessId: string, tenant: TenantRepository) {
    super(ctx, businessId);
    this.customers = new CustomerRepository(tenant);
    this.coupons = new CouponExportRepository(tenant);
    this.feeds = new FeedExportRepository(tenant);
  }

  async exportFeed(
    query: SheetsExportQuery,
    limit: number,
    cursor: Cursor | null
  ): Promise<{ items: SheetsExportRow[]; page: { nextCursor: string | null; hasMore: boolean; limit: number } }> {
    switch (query.feed) {
      case "all_customers":
        return this.listCustomers({
          limit,
          cursor,
          search: query.search?.trim() || null,
          rewardFilter: "all",
          joinedDays: null,
          joinedFrom: query.joinedFrom ?? null,
          joinedTo: query.joinedTo ?? null,
        });
      case "new_customers":
        return this.listCustomers({
          limit,
          cursor,
          search: null,
          rewardFilter: "all",
          joinedDays: joinedDaysFromQuery(query.joined) ?? 7,
          joinedFrom: null,
          joinedTo: null,
        });
      case "reward_customers":
        return this.listCustomers({
          limit,
          cursor,
          search: null,
          rewardFilter: "has_code",
          joinedDays: null,
          joinedFrom: null,
          joinedTo: null,
        });
      case "tag": {
        if (!query.tagId) throw new Error("tagId is required");
        const rows = await this.feeds.listByTag({ tagId: query.tagId, limit, cursor });
        const { items, page } = buildPage(rows, limit, (r) => ({ ts: r.created_at, id: r.id }));
        return { items: items.map(tagRowToDto), page };
      }
      case "campaign": {
        if (!query.campaignId) throw new Error("campaignId is required");
        const rows = await this.feeds.listByCampaign({ campaignId: query.campaignId, limit, cursor });
        const { items, page } = buildPage(rows, limit, (r) => ({ ts: r.played_at, id: r.id }));
        return { items: items.map(campaignPlayerToDto), page };
      }
      case "campaigns_summary": {
        const rows = await this.feeds.listCampaignsSummary({ limit, cursor });
        const { items, page } = buildPage(rows, limit, (r) => ({ ts: r.created_at, id: r.id }));
        return { items: items.map(campaignSummaryToDto), page };
      }
      case "shopify_codes":
        return this.listCodes({
          limit,
          cursor,
          status: query.status ?? null,
          campaignId: query.campaignId ?? null,
        });
    }
  }

  async listCustomers(opts: {
    limit: number;
    cursor: Cursor | null;
    search: string | null;
    rewardFilter: string;
    joinedDays: number | null;
    joinedFrom: string | null;
    joinedTo: string | null;
  }): Promise<{ items: SheetsCustomerExportDTO[]; page: { nextCursor: string | null; hasMore: boolean; limit: number } }> {
    const rows = await this.customers.list({
      limit: opts.limit,
      cursor: opts.cursor,
      search: opts.search,
      direction: "desc",
      rewardFilter: opts.rewardFilter,
      joinedDays: opts.joinedDays,
      joinedFrom: opts.joinedFrom,
      joinedTo: opts.joinedTo,
    });

    const { items, page } = buildPage(rows, opts.limit, (r) => ({
      ts: r.created_at,
      id: r.id,
    }));

    return { items: items.map((r) => toSheetsCustomerDTO(toListItemDTO(r))), page };
  }

  async listCodes(opts: {
    limit: number;
    cursor: Cursor | null;
    status: string | null;
    campaignId: string | null;
  }): Promise<{ items: SheetsCouponExportDTO[]; page: { nextCursor: string | null; hasMore: boolean; limit: number } }> {
    const rows = await this.coupons.list({
      limit: opts.limit,
      cursor: opts.cursor,
      status: opts.status,
      campaignId: opts.campaignId,
    });

    const { items, page } = buildPage(rows, opts.limit, (r) => ({
      ts: r.created_at,
      id: r.id,
    }));

    return { items: items.map(toSheetsCouponDTO), page };
  }

  async recordSync(): Promise<void> {
    await touchLastSync(this.businessId);
  }
}
