"use client";

import Link from "next/link";
import { ArrowRight, ShoppingBag, Sparkles, Store, Ticket } from "lucide-react";
import { useShopifyOverview, useCouponDrops } from "@/lib/api/hooks/use-shopify";
import type { ShopifyCouponDropDTO } from "@/lib/api/types";
import {
  PanelError,
  RowsSkeleton,
  UpdatingStrip,
} from "@/components/merchant/analytics/analytics-shared";

const nf = new Intl.NumberFormat("en-IN");

function SummaryTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Ticket;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-neutral-50/60 p-4">
      <div className={`inline-flex items-center justify-center size-8 rounded-xl ${tone}`}>
        <Icon className="size-4" />
      </div>
      <p className="text-2xl font-black text-neutral-900 mt-3 tabular-nums">{nf.format(value)}</p>
      <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mt-1">{label}</p>
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: ShopifyCouponDropDTO }) {
  const redeemRate =
    campaign.codes_minted > 0
      ? Math.round((campaign.codes_redeemed / campaign.codes_minted) * 100)
      : null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-5 py-3.5">
      <div className="min-w-0">
        <Link
          href={`/m/campaigns/${campaign.campaign_id}`}
          className="text-sm font-bold text-neutral-900 hover:text-emerald-700 transition-colors truncate block"
        >
          {campaign.campaign_name}
        </Link>
        <p className="text-[11px] font-medium text-neutral-400 mt-0.5 capitalize">
          {campaign.campaign_status} · pool {campaign.pool_status}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold text-neutral-600 shrink-0">
        <span className="tabular-nums">
          <span className="text-neutral-400 font-bold">Generated</span> {nf.format(campaign.codes_minted)}
        </span>
        <span className="tabular-nums">
          <span className="text-neutral-400 font-bold">In Shopify</span> {nf.format(campaign.codes_claimed)}
        </span>
        <span className="tabular-nums">
          <span className="text-neutral-400 font-bold">Redeemed</span> {nf.format(campaign.codes_redeemed)}
          {redeemRate !== null && redeemRate > 0 ? ` (${redeemRate}%)` : ""}
        </span>
      </div>
    </div>
  );
}

function ShopifyCouponPanelContent({ shopDomain }: { shopDomain?: string | null }) {
  const drops = useCouponDrops(true);
  const campaigns = drops.data?.campaigns ?? [];

  const totals = campaigns.reduce(
    (acc, c) => ({
      generated: acc.generated + c.codes_minted,
      inShopify: acc.inShopify + c.codes_claimed,
      redeemed: acc.redeemed + c.codes_redeemed,
    }),
    { generated: 0, inShopify: 0, redeemed: 0 }
  );

  const withCodes = campaigns.filter((c) => c.codes_minted > 0);

  return (
    <section className="bg-white rounded-3xl border border-neutral-200/80 shadow-sm overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-neutral-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center size-9 rounded-xl bg-rose-50 text-rose-600 shrink-0">
            <Store className="size-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-black text-neutral-900">Shopify discount codes</h2>
            <p className="text-[11px] font-medium text-neutral-400 truncate">
              {shopDomain
                ? `Coupon Drop codes for ${shopDomain}`
                : "Coupon Drop codes generated and redeemed in Shopify"}
            </p>
          </div>
        </div>
        <Link
          href="/m/shopify"
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 shrink-0"
        >
          Manage in Shopify
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {drops.isFetching && !drops.isLoading && <UpdatingStrip />}

      {drops.isLoading ? (
        <RowsSkeleton />
      ) : drops.isError ? (
        <PanelError
          message={
            drops.error instanceof Error ? drops.error.message : "Failed to load Shopify codes."
          }
          onRetry={() => drops.refetch()}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 border-b border-neutral-100">
            <SummaryTile
              icon={Sparkles}
              label="Generated"
              value={totals.generated}
              tone="text-violet-600 bg-violet-50"
            />
            <SummaryTile
              icon={Store}
              label="Live in Shopify"
              value={totals.inShopify}
              tone="text-emerald-600 bg-emerald-50"
            />
            <SummaryTile
              icon={ShoppingBag}
              label="Redeemed at checkout"
              value={totals.redeemed}
              tone="text-amber-600 bg-amber-50"
            />
          </div>

          {withCodes.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-xs font-semibold text-neutral-400">
                No Coupon Drop codes generated yet. Create a Coupon Drop campaign to mint Shopify
                discount codes.
              </p>
              <Link
                href="/m/campaigns/new"
                className="inline-flex items-center gap-1.5 mt-4 text-xs font-bold text-emerald-700 hover:text-emerald-800"
              >
                New campaign
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-50">
              {withCodes.map((c) => (
                <li key={c.campaign_id}>
                  <CampaignRow campaign={c} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** Shopify Coupon Drop stats — only rendered when the store is connected. */
export function AnalyticsShopifyPanel() {
  const shopify = useShopifyOverview();

  if (shopify.isLoading) return null;
  if (!shopify.data?.connected) return null;

  return <ShopifyCouponPanelContent shopDomain={shopify.data.shop?.domain} />;
}
