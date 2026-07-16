import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import type { LiveWinner, PrizeType } from "@/lib/types";
import { Trophy, Ticket } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live Winners — EngageOS",
  robots: { index: false, follow: false },
};

const PRIZE_TYPE_LABELS: Record<PrizeType, string> = {
  coupon: "Coupon",
  physical_gift: "Physical Gift",
  gift_voucher: "Gift Voucher",
  lucky_draw: "Lucky Draw",
  cashback: "Cashback",
  wallet_points: "Wallet Points",
};

/** Mask the middle of a phone number, showing only the last 4 digits. */
function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  if (phone.length <= 4) return phone;
  return `${phone.slice(0, 3)}••••${phone.slice(-4)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default async function WinnersPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login");

  let winners: LiveWinner[] = [];
  try {
    winners = await repo.liveWinners<LiveWinner>(100);
  } catch (err) {
    console.error("live winners error:", err);
  }

  return (
    <MerchantShell businessName={biz.name} city={biz.city} hideHeader>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-2xl bg-amber-50">
            <Trophy className="size-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-xl font-black text-neutral-900 tracking-tight">Live Winners</h1>
            <p className="text-xs text-neutral-500">Every prize awarded across your campaigns, newest first.</p>
          </div>
        </div>

        {winners.length === 0 ? (
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-12 text-center">
            <Trophy className="size-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-neutral-900">No winners yet</p>
            <p className="text-xs text-neutral-500 mt-1">As customers win prizes, they&apos;ll appear here in real time.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
            {/* Table header (desktop) */}
            <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 border-b border-neutral-100 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
              <span className="col-span-3">Customer</span>
              <span className="col-span-3">Prize</span>
              <span className="col-span-2">Campaign</span>
              <span className="col-span-2">Code</span>
              <span className="col-span-2 text-right">Won</span>
            </div>
            <div className="divide-y divide-neutral-100">
              {winners.map((w) => (
                <div key={w.event_id} className="grid grid-cols-2 md:grid-cols-12 gap-y-1 gap-x-3 px-5 py-3.5 items-center">
                  <div className="col-span-2 md:col-span-3 min-w-0">
                    <p className="text-sm font-bold text-neutral-900 truncate">{w.customer_name ?? "Guest"}</p>
                    <p className="text-[11px] text-neutral-400 font-semibold">{maskPhone(w.customer_phone)}</p>
                  </div>
                  <div className="col-span-2 md:col-span-3 flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold text-neutral-800 truncate">{w.prize_name ?? "Prize"}</span>
                    {w.prize_type && (
                      <span className="shrink-0 text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded-md px-2 py-0.5 border border-neutral-200/60">
                        {PRIZE_TYPE_LABELS[w.prize_type] ?? w.prize_type}
                      </span>
                    )}
                  </div>
                  <div className="col-span-1 md:col-span-2 min-w-0">
                    <span className="text-xs text-neutral-500 font-medium truncate">{w.campaign_name ?? "—"}</span>
                  </div>
                  <div className="col-span-1 md:col-span-2 min-w-0">
                    {w.coupon_code ? (
                      <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-neutral-700">
                        <Ticket className="size-3 text-neutral-400" />
                        {w.coupon_code}
                      </span>
                    ) : (
                      <span className="text-xs text-neutral-300">—</span>
                    )}
                  </div>
                  <div className="col-span-2 md:col-span-2 md:text-right">
                    <span className="text-[11px] font-semibold text-neutral-400">{timeAgo(w.won_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </MerchantShell>
  );
}
