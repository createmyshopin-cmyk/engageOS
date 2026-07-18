"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BarChart3,
  Users,
  Gift,
  MessageSquare,
  Settings,
  Eye,
  Download,
  RefreshCw,
  Loader2,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Power,
  PowerOff,
  Rocket,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import type { Campaign, Prize, CampaignFunnel, RedirectDestinationType, RedirectDelay, RewardPerformanceRow, RedirectAnalytics } from "@/lib/types";
import { updateCampaignStatusAction, retryFailedWhatsAppAction, updateCampaignAction, updateRedirectAction } from "@/app/m/campaigns/actions";
import { ExperienceForm } from "@/components/merchant/experience-form";
import { deleteRewardAction, duplicateRewardAction, setRewardActiveAction } from "@/app/m/campaigns/[id]/rewards/actions";
import { RewardForm } from "@/components/merchant/reward-form";
import { CampaignTrackingForm } from "@/components/merchant/tracking/campaign-tracking-form";

interface Stats {
  plays: number;
  wins: number;
  redeemed: number;
  customers: number;
  waSent: number;
  waFailed: number;
  winRate: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string;
  created_at: string;
}

interface CouponStat {
  issued: number;
  redeemed: number;
  remaining: number;
}

interface Props {
  campaign: Campaign;
  prizes: Prize[];
  recentCustomers: Customer[];
  couponStats: Record<string, CouponStat>;
  stats: Stats;
  funnel: CampaignFunnel;
  rewardPerf: RewardPerformanceRow[];
  redirectStats: RedirectAnalytics;
}

const TABS = [
  { id: "overview",   label: "Overview",  icon: Eye },
  { id: "analytics",  label: "Analytics", icon: BarChart3 },
  { id: "rewards",    label: "Rewards",   icon: Gift },
  { id: "postwin",    label: "Post Win",  icon: Rocket },
  { id: "experience", label: "Customer Experience", icon: Sparkles },
  { id: "customers",  label: "Customers", icon: Users },
  { id: "whatsapp",   label: "WhatsApp",  icon: MessageSquare },
  { id: "settings",   label: "Settings",  icon: Settings },
];

export function CampaignDetailTabs({ campaign, prizes, recentCustomers, couponStats, stats, funnel, rewardPerf, redirectStats }: Props) {
  const [activeTab, setActiveTab] = useState("overview");
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function act(fn: () => Promise<{ error: string | null }>) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setMsg({ type: "error", text: res.error });
      else setMsg({ type: "success", text: "Done!" });
      setTimeout(() => setMsg(null), 3000);
    });
  }

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 bg-white border border-neutral-200 rounded-2xl p-1.5 mb-5 overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === id
                ? "bg-[#111827] text-white shadow-sm"
                : "text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`flex items-center gap-2 mb-4 text-sm px-4 py-2.5 rounded-xl border ${
          msg.type === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {msg.type === "success" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          {msg.text}
        </div>
      )}

      {/* ── Overview Tab ── */}
      {activeTab === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <OverviewCard label="QR Scans" value={stats.plays} sub="Total campaign plays" color="blue" />
          <OverviewCard label="Customers Joined" value={stats.customers} sub="Unique customers" color="purple" />
          <OverviewCard label="Coupons Redeemed" value={stats.redeemed} sub="Of total issued" color="green" />
          <OverviewCard label="WhatsApp Sent" value={stats.waSent} sub="Delivery confirmations" color="teal" />
          <OverviewCard label="Win Rate" value={`${stats.winRate}%`} sub="Players who won" color="orange" />
          <OverviewCard label="Total Wins" value={stats.wins} sub="Prizes awarded" color="rose" />
        </div>
      )}

      {/* ── Analytics Tab ── */}
      {activeTab === "analytics" && (
        <div className="space-y-4">
          {/* Event-sourced funnel: QR Scan → Registration → Scratch → Prize
              → Coupon → Redemption. Counted from the immutable event log. */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-neutral-900">Conversion Funnel</h3>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">From event log</span>
            </div>
            <div className="space-y-2.5">
              {(() => {
                const steps = [
                  { label: "QR Scan", value: funnel.scans, color: "#3B82F6" },
                  { label: "Registration", value: funnel.registrations, color: "#8B5CF6" },
                  { label: "Scratch", value: funnel.scratches, color: "#0EA5E9" },
                  { label: "Prize Won", value: funnel.prizes_won, color: "#16A34A" },
                  { label: "Coupon Issued", value: funnel.coupons, color: "#F59E0B" },
                  { label: "Redemption", value: funnel.redemptions, color: "#EF4444" },
                ];
                const top = Math.max(funnel.scans, funnel.registrations, 1);
                return steps.map((s, i) => {
                  const prev = i === 0 ? null : steps[i - 1].value;
                  const conv = prev && prev > 0 ? Math.round((s.value / prev) * 100) : null;
                  return (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-neutral-500 w-28 shrink-0">{s.label}</span>
                      <div className="flex-1 h-6 bg-neutral-100 rounded-lg overflow-hidden">
                        <div
                          className="h-full rounded-lg transition-all duration-700 flex items-center justify-end pr-2"
                          style={{ width: `${Math.max(Math.round((s.value / top) * 100), s.value > 0 ? 6 : 0)}%`, backgroundColor: s.color }}
                        >
                          {s.value > 0 && <span className="text-[10px] font-black text-white">{s.value}</span>}
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-neutral-400 w-12 text-right shrink-0">
                        {conv != null ? `${conv}%` : "—"}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-neutral-100">
              <AnalyticStat label="Scan → Register" value={funnel.scans > 0 ? `${Math.round((funnel.registrations / funnel.scans) * 100)}%` : "–"} />
              <AnalyticStat label="Register → Redeem" value={funnel.registrations > 0 ? `${Math.round((funnel.redemptions / funnel.registrations) * 100)}%` : "–"} />
              <AnalyticStat label="Return Visits" value={funnel.return_visits} />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-neutral-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-neutral-900">Campaign Performance</h3>
              <TrendingUp className="size-4 text-emerald-500" />
            </div>
            {/* Simple SVG bar chart */}
            <div className="space-y-3">
              {[
                { label: "QR Scans", value: stats.plays, max: Math.max(stats.plays, 1), color: "#3B82F6" },
                { label: "Customers", value: stats.customers, max: Math.max(stats.plays, 1), color: "#8B5CF6" },
                { label: "Wins", value: stats.wins, max: Math.max(stats.plays, 1), color: "#16A34A" },
                { label: "Redeemed", value: stats.redeemed, max: Math.max(stats.plays, 1), color: "#F59E0B" },
                { label: "WA Sent", value: stats.waSent, max: Math.max(stats.plays, 1), color: "#14B8A6" },
              ].map(({ label, value, max, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-neutral-500 w-24 shrink-0">{label}</span>
                  <div className="flex-1 h-5 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${Math.round((value / max) * 100)}%`, backgroundColor: color }}
                    />
                  </div>
                  <span className="text-sm font-black text-neutral-900 w-10 text-right">{value}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-neutral-100">
              <AnalyticStat label="Win Rate" value={`${stats.winRate}%`} />
              <AnalyticStat label="Redemption Rate" value={stats.wins > 0 ? `${Math.round((stats.redeemed / stats.wins) * 100)}%` : "–"} />
              <AnalyticStat label="WA Delivery" value={stats.wins > 0 ? `${Math.round((stats.waSent / Math.max(stats.wins, 1)) * 100)}%` : "–"} />
              <AnalyticStat label="WA Failed" value={stats.waFailed} />
            </div>
          </div>

          {/* Reward Performance — per-reward wins, redemptions, inventory. */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-neutral-900">Reward Performance</h3>
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Top rewards first</span>
            </div>
            {rewardPerf.length === 0 ? (
              <p className="text-sm text-neutral-400 py-6 text-center">No reward data yet.</p>
            ) : (
              <div className="space-y-2.5">
                {(() => {
                  const topWins = Math.max(...rewardPerf.map((r) => r.won_count), 1);
                  return rewardPerf.map((r) => (
                    <div key={r.prize_id} className="flex items-center gap-3">
                      <span className="text-xs font-semibold text-neutral-600 w-32 shrink-0 truncate">{r.name}</span>
                      <div className="flex-1 h-5 bg-neutral-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.max(Math.round((r.won_count / topWins) * 100), r.won_count > 0 ? 6 : 0)}%`, backgroundColor: r.is_active ? "#16A34A" : "#9CA3AF" }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-neutral-500 w-28 text-right shrink-0">
                        {r.won_count} won · {r.redeemed} red
                      </span>
                      <span className="text-[11px] font-bold text-neutral-400 w-20 text-right shrink-0">
                        {r.remaining}/{r.total_quantity} left
                      </span>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Post Win Redirect — CTR, completion, most-visited link. */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-neutral-900">Post Win Redirect</h3>
              <ExternalLink className="size-4 text-neutral-400" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <AnalyticStat label="Reward Views" value={redirectStats.views} />
              <AnalyticStat label="Redirect CTR" value={redirectStats.views > 0 ? `${Math.round((redirectStats.opens / redirectStats.views) * 100)}%` : "–"} />
              <AnalyticStat label="Completion" value={redirectStats.starts > 0 ? `${Math.round((redirectStats.completes / redirectStats.starts) * 100)}%` : "–"} />
              <AnalyticStat label="Cancelled" value={redirectStats.cancels} />
            </div>
            <div className="mt-4 pt-4 border-t border-neutral-100">
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-widest">Most Visited Link</p>
              {redirectStats.most_visited ? (
                <a href={redirectStats.most_visited} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-emerald-600 hover:underline break-all">
                  {redirectStats.most_visited}
                </a>
              ) : (
                <p className="text-sm text-neutral-400">No redirects opened yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Rewards Tab ── */}
      {activeTab === "rewards" && (
        <RewardsManager campaign={campaign} prizes={prizes} couponStats={couponStats} />
      )}

      {/* ── Post Win Tab ── */}
      {activeTab === "postwin" && (
        <PostWinForm campaign={campaign} />
      )}

      {/* ── Customer Experience Tab ── */}
      {activeTab === "experience" && (
        <ExperienceForm campaign={campaign} />
      )}

      {/* ── Customers Tab ── */}
      {activeTab === "customers" && (
        <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
            <h3 className="font-bold text-neutral-900">Customers ({stats.customers})</h3>
            <a
              href="/m/dashboard/customers.csv"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 transition-colors"
            >
              <Download className="size-3.5" />
              Export CSV
            </a>
          </div>
          {recentCustomers.length === 0 ? (
            <div className="py-16 text-center text-neutral-400 text-sm">No customers yet.</div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {recentCustomers.map((customer) => (
                <div key={customer.id} className="px-6 py-3.5 flex items-center gap-4">
                  <div className="flex items-center justify-center size-8 rounded-full bg-emerald-100 text-emerald-700 font-black text-xs shrink-0">
                    {customer.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-neutral-900 truncate">{customer.name}</p>
                    <p className="text-xs text-neutral-500">{customer.phone}</p>
                  </div>
                  <span className="text-[11px] text-neutral-400 shrink-0">
                    {new Date(customer.created_at).toLocaleDateString("en-IN")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── WhatsApp Tab ── */}
      {activeTab === "whatsapp" && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <WaStat label="Sent" value={stats.waSent} color="text-emerald-600" />
            <WaStat label="Failed" value={stats.waFailed} color="text-red-500" />
            <WaStat label="Pending" value={Math.max(0, stats.wins - stats.waSent - stats.waFailed)} color="text-amber-600" />
          </div>
          {stats.waFailed > 0 && (
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-5">
              <p className="text-sm font-bold text-neutral-900 mb-1">
                {stats.waFailed} failed messages
              </p>
              <p className="text-xs text-neutral-500 mb-4">
                These coupons could not be delivered via WhatsApp. Click below to retry.
              </p>
              <button
                onClick={() => act(() => retryFailedWhatsAppAction(campaign.id))}
                disabled={isPending}
                className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-colors disabled:opacity-60 cursor-pointer"
              >
                {isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Retry All Failed
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Settings Tab ── */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          <SettingsForm campaign={campaign} />
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6">
            <CampaignTrackingForm campaignId={campaign.id} />
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub components ─────────────────────────────────────────── */

function RewardsManager({
  campaign,
  prizes,
  couponStats,
}: {
  campaign: Campaign;
  prizes: Prize[];
  couponStats: Record<string, CouponStat>;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Prize | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function onSaved() {
    setEditing(null);
    setAdding(false);
    setMsg({ type: "success", text: "Reward saved!" });
    setTimeout(() => setMsg(null), 3000);
    router.refresh();
  }

  function flash(res: { error: string | null }, okText: string) {
    if (res.error) setMsg({ type: "error", text: res.error });
    else {
      setMsg({ type: "success", text: okText });
      router.refresh();
    }
    setTimeout(() => setMsg(null), 3000);
  }

  function remove(prize: Prize) {
    if (deletingId) return;
    setDeletingId(prize.id);
    startTransition(async () => {
      const res = await deleteRewardAction(campaign.id, prize.id);
      setDeletingId(null);
      flash(res, "Reward deleted.");
    });
  }

  function duplicate(prize: Prize) {
    if (busyId) return;
    setBusyId(prize.id);
    startTransition(async () => {
      const res = await duplicateRewardAction(campaign.id, prize.id);
      setBusyId(null);
      flash(res, "Reward duplicated (disabled).");
    });
  }

  function toggleActive(prize: Prize) {
    if (busyId) return;
    setBusyId(prize.id);
    startTransition(async () => {
      const res = await setRewardActiveAction(campaign.id, prize.id, !prize.is_active);
      setBusyId(null);
      flash(res, prize.is_active ? "Reward disabled." : "Reward enabled.");
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between">
        <h3 className="font-bold text-neutral-900">Rewards ({prizes.length})</h3>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-2 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl transition-colors cursor-pointer"
        >
          <Plus className="size-3.5" />
          Add Reward
        </button>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 mx-6 mt-4 text-sm px-4 py-2.5 rounded-xl border ${
          msg.type === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {msg.type === "success" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          {msg.text}
        </div>
      )}

      {prizes.length === 0 ? (
        <div className="py-16 text-center text-neutral-400 text-sm">No rewards yet. Click “Add Reward” to create one.</div>
      ) : (
        <div className="divide-y divide-neutral-100">
          {prizes.map((prize) => {
            const stat = couponStats[prize.name];
            const remaining = prize.total_quantity - prize.won_count;
            const pct = Math.round((prize.won_count / Math.max(prize.total_quantity, 1)) * 100);
            return (
              <div key={prize.id} className={`px-6 py-4 flex flex-wrap items-center gap-4 ${prize.is_active ? "" : "opacity-60"}`}>
                <div
                  className="flex items-center justify-center size-12 rounded-xl shrink-0 overflow-hidden text-white"
                  style={{ backgroundColor: prize.background_color ?? "#059669" }}
                >
                  {prize.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={prize.image_url} alt={prize.name} className="size-full object-cover" />
                  ) : (
                    <Gift className="size-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-neutral-900 text-sm truncate">{prize.name}</p>
                    {prize.badge && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 rounded-md px-2 py-0.5 border border-amber-100">{prize.badge}</span>
                    )}
                    {prize.is_fallback && (
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-50 rounded-md px-2 py-0.5 border border-blue-100">Fallback</span>
                    )}
                    <span className={`text-[10px] font-bold rounded-md px-2 py-0.5 border ${
                      prize.is_active
                        ? "text-emerald-700 bg-emerald-50 border-emerald-100"
                        : "text-neutral-500 bg-neutral-100 border-neutral-200"
                    }`}>
                      {prize.is_active ? "Active" : "Disabled"}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    Weight: {prize.weight} · Priority: {prize.priority} · Sort: {prize.sort_order} · Expiry: {prize.expiry_days}d
                    {prize.prize_value != null ? ` · ₹${prize.prize_value}` : ""}
                  </p>
                  <div className="mt-2 h-1.5 bg-neutral-100 rounded-full w-full">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${100 - pct}%` }} />
                  </div>
                </div>
                <div className="flex gap-4 text-center shrink-0">
                  <PrizeStat label="Total" value={prize.total_quantity} />
                  <PrizeStat label="Won" value={prize.won_count} />
                  <PrizeStat label="Remaining" value={remaining} highlight={remaining > 0} />
                  {stat && <PrizeStat label="Redeemed" value={stat.redeemed} />}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(prize)}
                    disabled={isPending && busyId === prize.id}
                    className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors disabled:opacity-50 cursor-pointer"
                    aria-label={prize.is_active ? "Disable reward" : "Enable reward"}
                  >
                    {isPending && busyId === prize.id ? <Loader2 className="size-4 animate-spin" /> : prize.is_active ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                  </button>
                  <button
                    onClick={() => duplicate(prize)}
                    disabled={isPending && busyId === prize.id}
                    className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors disabled:opacity-50 cursor-pointer"
                    aria-label="Duplicate reward"
                  >
                    <Copy className="size-4" />
                  </button>
                  <button
                    onClick={() => setEditing(prize)}
                    className="p-2 rounded-lg text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 transition-colors cursor-pointer"
                    aria-label="Edit reward"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    onClick={() => remove(prize)}
                    disabled={isPending && deletingId === prize.id}
                    className="p-2 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
                    aria-label="Delete reward"
                  >
                    {isPending && deletingId === prize.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(adding || editing) && (
        <RewardForm
          campaignId={campaign.id}
          prize={editing ?? undefined}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function OverviewCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "from-blue-50 border-blue-200 text-blue-700",
    purple: "from-purple-50 border-purple-200 text-purple-700",
    green: "from-emerald-50 border-emerald-200 text-emerald-700",
    teal: "from-teal-50 border-teal-200 text-teal-700",
    orange: "from-amber-50 border-amber-200 text-amber-700",
    rose: "from-rose-50 border-rose-200 text-rose-700",
  };
  return (
    <div className={`bg-gradient-to-br ${colorMap[color]} border rounded-2xl p-5`}>
      <div className={`text-2xl font-black mb-1 ${colorMap[color].split(" ")[2]}`}>{value}</div>
      <div className="text-sm font-bold text-neutral-800">{label}</div>
      <div className="text-xs text-neutral-500 mt-0.5">{sub}</div>
    </div>
  );
}

function AnalyticStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <div className="text-lg font-black text-neutral-900">{value}</div>
      <div className="text-[11px] text-neutral-500 mt-0.5">{label}</div>
    </div>
  );
}

function PrizeStat({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center">
      <div className={`text-base font-black ${highlight ? "text-emerald-600" : "text-neutral-700"}`}>{value}</div>
      <div className="text-[10px] text-neutral-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function WaStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 p-5 text-center">
      <div className={`text-2xl font-black ${color}`}>{value}</div>
      <div className="text-xs text-neutral-500 font-semibold mt-1">{label}</div>
    </div>
  );
}

function SettingsForm({ campaign }: { campaign: Campaign }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [form, setForm] = useState({
    name: campaign.name,
    headline: campaign.headline,
    description: campaign.description ?? "",
    banner_url: campaign.banner_url ?? "",
    logo_url: campaign.logo_url ?? "",
    terms: campaign.terms ?? "",
    coupon_prefix: campaign.coupon_prefix,
    starts_at: campaign.starts_at.slice(0, 10),
    ends_at: campaign.ends_at.slice(0, 10),
  });

  const inputCls = "w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition";

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await updateCampaignAction(campaign.id, { error: null }, {
        ...form,
        starts_at: new Date(form.starts_at),
        ends_at: new Date(form.ends_at),
      });
      if (res.error) setMsg({ type: "error", text: res.error });
      else setMsg({ type: "success", text: "Settings saved successfully!" });
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 space-y-5">
      <h3 className="font-bold text-neutral-900 text-base">Campaign Settings</h3>

      {msg && (
        <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border ${
          msg.type === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {msg.type === "success" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          {msg.text}
        </div>
      )}

      <div className="grid gap-4">
        <Field label="Campaign Name">
          <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputCls} />
        </Field>
        <Field label="Headline">
          <input type="text" value={form.headline} onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))} className={inputCls} />
        </Field>
        <Field label="Description">
          <textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputCls + " resize-none"} />
        </Field>
        <Field label="Banner URL">
          <input type="url" value={form.banner_url} onChange={(e) => setForm((f) => ({ ...f, banner_url: e.target.value }))} className={inputCls} />
        </Field>
        <Field label="Logo URL">
          <input type="url" value={form.logo_url} onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))} className={inputCls} />
        </Field>
        <Field label="Terms & Conditions">
          <textarea rows={3} value={form.terms} onChange={(e) => setForm((f) => ({ ...f, terms: e.target.value }))} className={inputCls + " resize-none"} />
        </Field>
        <Field label="Coupon Prefix">
          <input type="text" value={form.coupon_prefix}
            onChange={(e) => setForm((f) => ({ ...f, coupon_prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) }))}
            className={inputCls} maxLength={10}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Start Date">
            <input type="date" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} className={inputCls} />
          </Field>
          <Field label="End Date">
            <input type="date" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} className={inputCls} />
          </Field>
        </div>
      </div>

      <div className="pt-4 border-t border-neutral-100">
        <button
          onClick={save}
          disabled={isPending}
          className="inline-flex items-center gap-2 text-sm font-bold px-6 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl transition-colors disabled:opacity-60 cursor-pointer"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Save Settings
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-bold text-neutral-700">{label}</label>
      {children}
    </div>
  );
}

const DESTINATIONS: { value: RedirectDestinationType; label: string; hint: string }[] = [
  { value: "none", label: "None", hint: "Stay on the result page — no redirect" },
  { value: "website", label: "Website", hint: "https://yourstore.com" },
  { value: "product", label: "Product Page", hint: "https://yourstore.com/product/123" },
  { value: "instagram", label: "Instagram", hint: "https://instagram.com/yourbrand" },
  { value: "facebook", label: "Facebook", hint: "https://facebook.com/yourbrand" },
  { value: "youtube", label: "YouTube", hint: "https://youtube.com/@yourbrand" },
  { value: "tiktok", label: "TikTok", hint: "https://tiktok.com/@yourbrand" },
  { value: "whatsapp", label: "WhatsApp", hint: "https://wa.me/91XXXXXXXXXX" },
  { value: "telegram", label: "Telegram", hint: "https://t.me/yourchannel" },
  { value: "custom", label: "Custom URL", hint: "Any https:// link" },
];

const DELAY_OPTIONS: RedirectDelay[] = [0, 3, 5, 10, 15, 30];

function PostWinForm({ campaign }: { campaign: Campaign }) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [enabled, setEnabled] = useState(campaign.redirect_enabled ?? false);
  const [delay, setDelay] = useState<RedirectDelay>((campaign.redirect_delay ?? 5) as RedirectDelay);
  const [destination, setDestination] = useState<RedirectDestinationType>(
    campaign.redirect_destination_type ?? "none"
  );
  const [url, setUrl] = useState(campaign.redirect_url ?? "");

  const inputCls =
    "w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 transition";

  const activeHint = DESTINATIONS.find((d) => d.value === destination)?.hint ?? "";
  const needsUrl = enabled && destination !== "none";

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await updateRedirectAction(campaign.id, { error: null }, {
        enabled,
        delay,
        destination_type: destination,
        url: destination === "none" ? "" : url.trim(),
      });
      if (res.error) setMsg({ type: "error", text: res.error });
      else setMsg({ type: "success", text: "Post Win settings saved!" });
    });
  }

  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-6 space-y-5">
      <div>
        <h3 className="font-bold text-neutral-900 text-base flex items-center gap-2">
          <Rocket className="size-4 text-[#111827]" />
          Post Win Experience
        </h3>
        <p className="text-sm text-neutral-500 mt-1">
          After a customer wins and views their reward, send them somewhere — your store,
          a product page, or your social profiles. The customer can always open now, stay,
          or cancel the redirect.
        </p>
      </div>

      {msg && (
        <div className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border ${
          msg.type === "success"
            ? "bg-emerald-50 border-emerald-200 text-emerald-700"
            : "bg-red-50 border-red-200 text-red-700"
        }`}>
          {msg.type === "success" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          {msg.text}
        </div>
      )}

      {/* Enable toggle */}
      <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 px-4 py-3 cursor-pointer">
        <div>
          <span className="text-sm font-bold text-neutral-900">Enable Post Win redirect</span>
          <p className="text-xs text-neutral-500">Turn the automatic redirect on for this campaign.</p>
        </div>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="size-5 accent-emerald-600 cursor-pointer"
        />
      </label>

      <div className={enabled ? "grid gap-4" : "grid gap-4 opacity-50 pointer-events-none"}>
        <Field label="Redirect Delay">
          <div className="flex flex-wrap gap-2">
            {DELAY_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDelay(d)}
                className={`px-3.5 py-2 rounded-xl text-sm font-bold border transition-colors cursor-pointer ${
                  delay === d
                    ? "bg-[#111827] text-white border-[#111827]"
                    : "bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50"
                }`}
              >
                {d === 0 ? "Instant" : `${d}s`}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Destination Type">
          <select
            value={destination}
            onChange={(e) => setDestination(e.target.value as RedirectDestinationType)}
            className={inputCls}
          >
            {DESTINATIONS.map((d) => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </Field>

        {destination !== "none" && (
          <Field label="Destination URL">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={activeHint}
              className={inputCls}
            />
            <p className="text-[11px] text-neutral-400 mt-1">Must start with http:// or https://</p>
          </Field>
        )}
      </div>

      <div className="pt-4 border-t border-neutral-100 flex items-center gap-3">
        <button
          onClick={save}
          disabled={isPending || (needsUrl && !url.trim())}
          className="inline-flex items-center gap-2 text-sm font-bold px-6 py-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white rounded-xl transition-colors disabled:opacity-60 cursor-pointer"
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          Save Settings
        </button>
        {enabled && destination !== "none" && url.trim() && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-neutral-500 hover:text-neutral-900 transition-colors"
          >
            <ExternalLink className="size-4" />
            Preview
          </a>
        )}
      </div>
    </div>
  );
}
