"use client";

/**
 * CustomerDetailDrawer — the Customer 360 panel.
 *
 * Slides in when a customer row is selected. Pulls the 360 bundle
 * (profile + consents + tags + analytics + rewards) and the unified timeline
 * (funnel log + universal events, keyset-paginated) via React Query.
 */

import { useEffect, useState } from "react";
import {
  X,
  Phone,
  Mail,
  Tag as TagIcon,
  Loader2,
  AlertTriangle,
  Activity,
  Gift,
  Ticket,
  Copy,
  Check,
  Calendar,
  Clock,
  Star,
  Trophy,
} from "lucide-react";
import { useCustomer360, useCustomerTimeline, flattenTimelinePages } from "@/lib/api/hooks/use-customers";
import { timeAgo } from "@/components/merchant/campaign-events-timeline";
import type { TimelineEntryDTO } from "@/lib/api/types";

interface Bundle {
  profile?: {
    name?: string | null;
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    language?: string | null;
    source?: string | null;
    created_at?: string | null;
  } | null;
  consents?: Record<string, string> | null;
  tags?: string[] | null;
  summary?: {
    coupons_total?: number;
    coupons_active?: number;
    coupons_redeemed?: number;
    campaigns_played?: number;
    customer_since?: string | null;
    last_seen_at?: string | null;
  } | null;
  analytics?: {
    total_orders?: number;
    total_spend?: number | string;
    total_plays?: number;
    total_wins?: number;
    total_redemptions?: number;
    rfm_score?: string | null;
    health_score?: number | null;
    clv?: number | string | null;
    last_seen_at?: string | null;
    recency_days?: number | null;
  } | null;
  rewards?: CustomerRewardRow[] | null;
}

interface CustomerRewardRow {
  id: string;
  code: string | null;
  prize_name: string;
  prize_type: string;
  status: string;
  campaign_name: string;
  expires_at: string | null;
  redeemed_at: string | null;
  created_at: string;
  shopify_linked: boolean;
}

function initials(name?: string | null): string {
  if (!name) return "CU";
  return name.trim().slice(0, 2).toUpperCase();
}

function formatShortDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function customerTier(a: Bundle["analytics"], summary: Bundle["summary"]): {
  label: string;
  tone: string;
} {
  const health = a?.health_score ?? 0;
  const redemptions = a?.total_redemptions ?? summary?.coupons_redeemed ?? 0;
  const plays = a?.total_plays ?? summary?.campaigns_played ?? 0;
  const recency = a?.recency_days;

  if (redemptions >= 2 || health >= 70) {
    return { label: "Champion", tone: "bg-amber-100 text-amber-800 border-amber-200" };
  }
  if (plays >= 2 || (recency != null && recency <= 14)) {
    return { label: "Active", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" };
  }
  if (plays >= 1) {
    return { label: "Engaged", tone: "bg-blue-100 text-blue-800 border-blue-200" };
  }
  return { label: "New", tone: "bg-neutral-100 text-neutral-600 border-neutral-200" };
}

const CATEGORY_TONE: Record<string, string> = {
  commerce: "bg-emerald-100 text-emerald-700",
  loyalty: "bg-amber-100 text-amber-700",
  campaign: "bg-blue-100 text-blue-700",
  communication: "bg-violet-100 text-violet-700",
  profile: "bg-neutral-100 text-neutral-700",
  marketing: "bg-pink-100 text-pink-700",
  system: "bg-neutral-100 text-neutral-500",
  ai: "bg-indigo-100 text-indigo-700",
};

export function CustomerDetailDrawer({
  customerId,
  onClose,
}: {
  customerId: string;
  onClose: () => void;
}) {
  const { data: bundle, isLoading, isError, error } = useCustomer360(customerId);
  const b = (bundle ?? {}) as Bundle;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = b.profile?.name || b.profile?.full_name || "Customer";
  const tier = customerTier(b.analytics, b.summary);
  const rewards = b.rewards ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />

      <aside className="relative h-full w-full max-w-md bg-[#F8FAFC] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-start justify-between gap-3 bg-white border-b border-neutral-200/80 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center size-11 rounded-2xl bg-[#16A34A] text-white text-sm font-black shrink-0">
              {initials(name)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-black text-neutral-900 truncate">{name}</h2>
                {!isLoading && !isError && (
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${tier.tone}`}>
                    <Star className="size-2.5" />
                    {tier.label}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-neutral-400 font-semibold truncate">
                {b.profile?.phone || ""}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition"
            aria-label="Close"
          >
            <X className="size-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {isLoading ? (
            <DrawerSkeleton />
          ) : isError ? (
            <div className="flex flex-col items-center text-center py-12">
              <AlertTriangle className="size-8 text-red-400 mb-3" />
              <p className="text-xs font-bold text-neutral-900">Couldn&apos;t load this profile</p>
              <p className="text-[11px] text-neutral-500 mt-1">
                {error instanceof Error ? error.message : "Please try again."}
              </p>
            </div>
          ) : (
            <>
              <CustomerSnapshot summary={b.summary} analytics={b.analytics} rewardCount={rewards.length} />

              <section className="bg-white rounded-2xl border border-neutral-200/80 p-4 space-y-2.5">
                <Row icon={<Phone className="size-3.5" />} label="Phone" value={b.profile?.phone || "—"} />
                <Row icon={<Mail className="size-3.5" />} label="Email" value={b.profile?.email || "—"} />
                <Row
                  icon={<Calendar className="size-3.5" />}
                  label="Joined"
                  value={formatShortDate(b.summary?.customer_since ?? b.profile?.created_at)}
                />
                <Row
                  icon={<Clock className="size-3.5" />}
                  label="Last seen"
                  value={
                    b.summary?.last_seen_at || b.analytics?.last_seen_at
                      ? timeAgo(b.summary?.last_seen_at ?? b.analytics?.last_seen_at!)
                      : "—"
                  }
                />
                {b.profile?.source && (
                  <Row icon={<Activity className="size-3.5" />} label="Source" value={b.profile.source} />
                )}
              </section>

              <AnalyticsGrid analytics={b.analytics} summary={b.summary} />

              <RewardsSection rewards={rewards} summary={b.summary} />

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">Consents</h3>
                <div className="flex flex-wrap gap-2">
                  {b.consents && Object.keys(b.consents).length > 0 ? (
                    Object.entries(b.consents).map(([channel, status]) => (
                      <span
                        key={channel}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                          status === "granted"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                            : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        <span className={`size-1.5 rounded-full ${status === "granted" ? "bg-emerald-500" : "bg-neutral-400"}`} />
                        {channel}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-neutral-400">No consent records.</span>
                  )}
                </div>
              </section>

              <section>
                <h3 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {b.tags && b.tags.length > 0 ? (
                    b.tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-neutral-900 text-white">
                        <TagIcon className="size-2.5" /> {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-neutral-400">No tags.</span>
                  )}
                </div>
              </section>

              <TimelineSection customerId={customerId} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function CustomerSnapshot({
  summary,
  analytics,
  rewardCount,
}: {
  summary?: Bundle["summary"];
  analytics?: Bundle["analytics"];
  rewardCount: number;
}) {
  const health = analytics?.health_score;
  const rfm = analytics?.rfm_score;

  return (
    <section className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="size-4 text-emerald-600" />
        <h3 className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Customer snapshot</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SnapshotCell label="Campaigns played" value={String(summary?.campaigns_played ?? analytics?.total_plays ?? 0)} />
        <SnapshotCell label="Codes claimed" value={String(summary?.coupons_total ?? rewardCount)} />
        <SnapshotCell label="Active codes" value={String(summary?.coupons_active ?? 0)} />
        <SnapshotCell label="Redeemed" value={String(summary?.coupons_redeemed ?? analytics?.total_redemptions ?? 0)} />
      </div>
      {(health != null || rfm) && (
        <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-emerald-100/80">
          {health != null && (
            <span className="rounded-lg bg-white border border-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
              Health score {health}/100
            </span>
          )}
          {rfm && (
            <span className="rounded-lg bg-white border border-emerald-100 px-2.5 py-1 text-[10px] font-bold text-emerald-800">
              RFM {rfm}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function SnapshotCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/80 border border-emerald-100/60 px-3 py-2">
      <p className="text-sm font-black text-neutral-900">{value}</p>
      <p className="text-[8px] font-bold uppercase tracking-wider text-neutral-400 mt-0.5">{label}</p>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-neutral-400">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 w-14">{label}</span>
      <span className="text-xs font-semibold text-neutral-800 truncate flex-1">{value}</span>
    </div>
  );
}

function money(v: number | string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return `₹${n.toLocaleString("en-IN")}`;
}

function AnalyticsGrid({
  analytics,
  summary,
}: {
  analytics?: Bundle["analytics"];
  summary?: Bundle["summary"];
}) {
  const a = analytics ?? {};
  const cells: { label: string; value: string }[] = [
    { label: "Orders", value: String(a.total_orders ?? 0) },
    { label: "Spend", value: money(a.total_spend) },
    { label: "Plays", value: String(a.total_plays ?? summary?.campaigns_played ?? 0) },
    { label: "Wins", value: String(a.total_wins ?? 0) },
    { label: "Redemptions", value: String(a.total_redemptions ?? summary?.coupons_redeemed ?? 0) },
    { label: "CLV", value: money(a.clv) },
  ];
  return (
    <section>
      <h3 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">Engagement &amp; value</h3>
      <div className="grid grid-cols-3 gap-2">
        {cells.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-neutral-200/80 p-3 text-center">
            <p className="text-sm font-black text-neutral-900">{c.value}</p>
            <p className="text-[8px] font-bold uppercase tracking-wider text-neutral-400 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RewardsSection({
  rewards,
  summary,
}: {
  rewards: CustomerRewardRow[];
  summary?: Bundle["summary"];
}) {
  const total = summary?.coupons_total ?? rewards.length;

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[10px] font-black uppercase tracking-wider text-neutral-400">
          Coupons &amp; gifts claimed
        </h3>
        {total > 0 && (
          <span className="rounded-full bg-rose-50 border border-rose-100 px-2 py-0.5 text-[9px] font-black text-rose-600">
            {total} total
          </span>
        )}
      </div>
      {rewards.length === 0 ? (
        <p className="text-[11px] text-neutral-400 rounded-2xl border border-dashed border-neutral-200 bg-white px-4 py-6 text-center">
          No coupons or gifts claimed yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {rewards.map((r) => (
            <RewardCard key={r.id} reward={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RewardCard({ reward }: { reward: CustomerRewardRow }) {
  const [copied, setCopied] = useState(false);
  const isCoupon = reward.prize_type === "coupon" || reward.prize_type === "gift_voucher";
  const Icon = isCoupon ? Ticket : Gift;
  const statusTone =
    reward.status === "redeemed"
      ? "bg-amber-50 text-amber-700 border-amber-100"
      : reward.status === "issued"
        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
        : "bg-neutral-100 text-neutral-600 border-neutral-200";

  function copyCode() {
    if (!reward.code || typeof navigator === "undefined") return;
    navigator.clipboard
      .writeText(reward.code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  return (
    <li className="rounded-2xl border border-neutral-200/80 bg-white p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-black text-neutral-900">{reward.prize_name}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold capitalize ${statusTone}`}>
              {reward.status}
            </span>
          </div>
          <p className="text-[10px] font-semibold text-neutral-400 mt-0.5 truncate">
            {reward.campaign_name}
          </p>
          {reward.code ? (
            <div className="mt-2 flex items-center gap-2">
              <code className="text-sm font-black tracking-wide text-neutral-900">{reward.code}</code>
              <button
                onClick={copyCode}
                title="Copy code"
                className="flex size-7 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
              >
                {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
              </button>
            </div>
          ) : (
            <p className="mt-2 text-[11px] font-medium text-neutral-600">
              Show at counter to collect
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-medium text-neutral-400">
            <span>Claimed {formatShortDate(reward.created_at)}</span>
            {reward.expires_at && (
              <span>
                Valid until {formatShortDate(reward.expires_at)}
              </span>
            )}
            {reward.redeemed_at && (
              <span className="text-amber-600">Redeemed {formatShortDate(reward.redeemed_at)}</span>
            )}
            {reward.shopify_linked && <span className="text-emerald-600">In Shopify</span>}
          </div>
        </div>
      </div>
    </li>
  );
}

function timelineLabel(name: string): string {
  const labels: Record<string, string> = {
    "whatsapp.sent": "WhatsApp sent",
    "whatsapp.delivered": "WhatsApp delivered",
    "whatsapp.read": "WhatsApp read",
    "whatsapp.received": "Customer replied on WhatsApp",
    "whatsapp.agent_replied": "Agent replied on WhatsApp",
    "whatsapp.conversation.created": "WhatsApp conversation started",
    "whatsapp.failed": "WhatsApp delivery failed",
    "whatsapp.queue": "WhatsApp queued",
    "broadcast.sent": "Broadcast sent",
    "loyalty.points.earned": "Points earned",
    "loyalty.points.redeemed": "Points redeemed",
    "loyalty.tier.upgraded": "Tier upgraded",
    "order.placed": "Order placed",
    coupon_issued: "Coupon issued",
    coupon_redeemed: "Coupon redeemed",
    registration: "Registered",
    scratch: "Scratch played",
    prize_won: "Prize won",
  };
  return labels[name] ?? name.replace(/[._]/g, " ");
}

function timelineDetail(e: TimelineEntryDTO): string | null {
  const p = e.payload ?? {};
  if (e.name === "coupon_issued" && typeof p.code === "string") {
    return `Code ${p.code}`;
  }
  if (e.name === "prize_won" && typeof p.prize_name === "string") {
    return p.prize_name;
  }
  if (e.name === "registration" && typeof p.source === "string") {
    return `via ${p.source}`;
  }
  if (e.name === "coupon_redeemed" && typeof p.code === "string") {
    return `Redeemed ${p.code}`;
  }
  if (e.name === "whatsapp.sent" && typeof p.couponCode === "string") {
    return `Coupon ${p.couponCode}`;
  }
  if (e.name === "whatsapp.received") {
    return "Inbound WhatsApp message";
  }
  if (e.name === "loyalty.tier.upgraded" && typeof p.to_tier === "string") {
    return `Upgraded to ${p.to_tier}`;
  }
  if (e.name === "order.placed" && (typeof p.total === "string" || typeof p.total_price === "string")) {
    return `Order ${p.total ?? p.total_price}`;
  }
  if (e.name === "loyalty.points.earned" && typeof p.delta === "number") {
    return `+${p.delta} pts`;
  }
  if (e.name === "loyalty.points.redeemed" && typeof p.delta === "number") {
    return `${p.delta} pts`;
  }
  if (e.name === "loyalty.points.adjusted" && typeof p.delta === "number") {
    return `${p.delta >= 0 ? "+" : ""}${p.delta} pts`;
  }
  if (typeof p.prize_name === "string") return p.prize_name;
  if (typeof p.code === "string") return p.code;
  return null;
}

function TimelineSection({ customerId }: { customerId: string }) {
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useCustomerTimeline(customerId);
  const entries = flattenTimelinePages(data?.pages);

  return (
    <section>
      <h3 className="text-[10px] font-black uppercase tracking-wider text-neutral-400 mb-2">Activity Timeline</h3>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="size-5 rounded-full bg-neutral-100 shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-2.5 w-40 bg-neutral-100 rounded" />
                <div className="h-2 w-24 bg-neutral-100 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <p className="text-[11px] text-neutral-400">Couldn&apos;t load the timeline.</p>
      ) : entries.length === 0 ? (
        <p className="text-[11px] text-neutral-400">No recorded activity yet.</p>
      ) : (
        <div className="relative border-l border-neutral-200 pl-4 ml-2 space-y-4">
          {entries.map((e: TimelineEntryDTO) => {
            const detail = timelineDetail(e);
            return (
              <div key={e.id} className="relative">
                <span
                  className={`absolute -left-[22px] top-0.5 size-4 rounded-full flex items-center justify-center ${
                    CATEGORY_TONE[e.category] ?? "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  <span className="size-1.5 rounded-full bg-current" />
                </span>
                <p className="text-xs font-bold text-neutral-900 leading-tight">{timelineLabel(e.name)}</p>
                {detail && (
                  <p className="text-[11px] font-semibold text-neutral-700 mt-0.5">{detail}</p>
                )}
                <p className="text-[10px] text-neutral-400 mt-0.5 font-medium capitalize">
                  {e.category} · {timeAgo(e.ts)}
                </p>
              </div>
            );
          })}
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="ml-[-4px] text-[11px] font-bold text-emerald-600 hover:text-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {isFetchingNextPage && <Loader2 className="size-3 animate-spin" />}
              Load more activity
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-28 bg-white rounded-2xl border border-neutral-200/80" />
      <div className="h-24 bg-white rounded-2xl border border-neutral-200/80" />
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 bg-white rounded-2xl border border-neutral-200/80" />
        ))}
      </div>
      <div className="h-32 bg-white rounded-2xl border border-neutral-200/80" />
    </div>
  );
}
