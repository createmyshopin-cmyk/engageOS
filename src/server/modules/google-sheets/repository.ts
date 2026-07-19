import "server-only";
import { Repository } from "@/server/core/Repository";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import type { Cursor } from "@/server/http/pagination";
import type { CustomerListRow } from "@/server/modules/customers/transformer";

export interface CouponExportRow {
  id: string;
  code: string;
  status: string;
  prize_name: string | null;
  campaign_id: string;
  campaign_name: string;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  shopify_linked: boolean;
  shopify_discount_code_id: string | null;
  source: string;
  created_at: string;
  redeemed_at: string | null;
  expires_at: string | null;
}

export interface TagCustomerExportRow extends CustomerListRow {
  tags: string | null;
}

export interface CampaignPlayerExportRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  created_at: string;
  campaign_name: string;
  prize_name: string | null;
  code: string | null;
  coupon_status: string | null;
  played_at: string;
}

export interface CampaignSummaryExportRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  starts_at: string;
  ends_at: string;
  created_at: string;
  plays: number;
  wins: number;
  redeemed: number;
  remaining_coupons: number;
}

export class CouponExportRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  async list(opts: {
    limit: number;
    cursor: Cursor | null;
    status: string | null;
    campaignId: string | null;
  }): Promise<CouponExportRow[]> {
    return this.tenant.rpcSelect<CouponExportRow>("merchant_list_coupons_for_export", {
      p_business_id: this.businessId,
      p_limit: opts.limit + 1,
      p_cursor_ts: opts.cursor?.ts ?? null,
      p_cursor_id: opts.cursor?.id ?? null,
      p_status: opts.status,
      p_campaign_id: opts.campaignId,
    });
  }
}

export class FeedExportRepository extends Repository {
  constructor(tenant: TenantRepository) {
    super(tenant);
  }

  async listByTag(opts: {
    tagId: string;
    limit: number;
    cursor: Cursor | null;
  }): Promise<TagCustomerExportRow[]> {
    return this.tenant.rpcSelect<TagCustomerExportRow>("merchant_list_customers_by_tag", {
      p_business_id: this.businessId,
      p_tag_id: opts.tagId,
      p_limit: opts.limit + 1,
      p_cursor_ts: opts.cursor?.ts ?? null,
      p_cursor_id: opts.cursor?.id ?? null,
    });
  }

  async listByCampaign(opts: {
    campaignId: string;
    limit: number;
    cursor: Cursor | null;
  }): Promise<CampaignPlayerExportRow[]> {
    return this.tenant.rpcSelect<CampaignPlayerExportRow>("merchant_list_customers_by_campaign", {
      p_business_id: this.businessId,
      p_campaign_id: opts.campaignId,
      p_limit: opts.limit + 1,
      p_cursor_ts: opts.cursor?.ts ?? null,
      p_cursor_id: opts.cursor?.id ?? null,
    });
  }

  async listCampaignsSummary(opts: {
    limit: number;
    cursor: Cursor | null;
  }): Promise<CampaignSummaryExportRow[]> {
    return this.tenant.rpcSelect<CampaignSummaryExportRow>("merchant_list_campaigns_for_export", {
      p_business_id: this.businessId,
      p_limit: opts.limit + 1,
      p_cursor_ts: opts.cursor?.ts ?? null,
      p_cursor_id: opts.cursor?.id ?? null,
    });
  }
}
