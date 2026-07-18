import "server-only";

/**
 * Wire shape of a campaign in the v1 list, enriched with per-campaign stats
 * from the existing event-sourced `campaign_stats_for_business` rollup. This is
 * a read/manage facade over the campaign engine — it never reimplements play
 * logic; it reports configuration + aggregate outcomes.
 */
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

export interface CampaignStatsDTO {
  plays: number;
  wins: number;
  redeemed: number;
  waSent: number;
  remainingCoupons: number;
  winRate: number;
}

/** Row shape selected from the campaigns table (tenant-scoped). */
export interface CampaignRow {
  id: string;
  name: string;
  slug: string;
  status: string;
  starts_at: string;
  ends_at: string;
  headline: string | null;
  banner_url: string | null;
  logo_url: string | null;
  created_at: string;
}

/** Per-campaign stats as returned by TenantRepository.campaignStats(). */
export interface CampaignStats {
  plays: number;
  wins: number;
  redeemed: number;
  wa_sent: number;
  wa_failed: number;
  remaining_coupons: number;
}

const ZERO_STATS: CampaignStats = {
  plays: 0,
  wins: 0,
  redeemed: 0,
  wa_sent: 0,
  wa_failed: 0,
  remaining_coupons: 0,
};

export function toCampaignListItemDTO(
  row: CampaignRow,
  stats: CampaignStats | undefined
): CampaignListItemDTO {
  const s = stats ?? ZERO_STATS;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    headline: row.headline,
    bannerUrl: row.banner_url,
    logoUrl: row.logo_url,
    createdAt: row.created_at,
    stats: {
      plays: s.plays,
      wins: s.wins,
      redeemed: s.redeemed,
      waSent: s.wa_sent,
      remainingCoupons: s.remaining_coupons,
      winRate: s.plays > 0 ? Math.round((s.wins / s.plays) * 100) : 0,
    },
  };
}
