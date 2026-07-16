import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { MerchantShell } from "@/components/merchant/merchant-shell";
import type { GiftInventoryRow, PrizeType } from "@/lib/types";
import { Gift, Package, AlertTriangle, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gift Inventory — EngageOS",
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

function pct(won: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((won / total) * 100));
}

export default async function RewardsInventoryPage() {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  const biz = await repo.getBusiness<{ name: string; city: string | null }>("name, city");
  if (!biz) redirect("/m/login");

  let rows: GiftInventoryRow[] = [];
  try {
    rows = await repo.giftInventory<GiftInventoryRow>();
  } catch (err) {
    console.error("gift inventory error:", err);
  }

  const totalStock = rows.reduce((s, r) => s + r.total_quantity, 0);
  const totalAwarded = rows.reduce((s, r) => s + r.won_count, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
  const lowStock = rows.filter((r) => r.total_quantity > 0 && r.remaining / r.total_quantity <= 0.1);

  // Group by campaign for readable sections.
  const byCampaign = new Map<string, { name: string; status: string; rows: GiftInventoryRow[] }>();
  for (const r of rows) {
    const entry = byCampaign.get(r.campaign_id) ?? { name: r.campaign_name, status: r.campaign_status, rows: [] };
    entry.rows.push(r);
    byCampaign.set(r.campaign_id, entry);
  }

  return (
    <MerchantShell businessName={biz.name} city={biz.city} hideHeader>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-2xl bg-emerald-50">
            <Gift className="size-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-black text-neutral-900 tracking-tight">Gift Inventory</h1>
            <p className="text-xs text-neutral-500">Live stock across all your campaign prizes.</p>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={<Package className="size-4 text-neutral-500" />} label="Total Stock" value={totalStock.toLocaleString("en-IN")} />
          <StatCard icon={<Gift className="size-4 text-emerald-600" />} label="Awarded" value={totalAwarded.toLocaleString("en-IN")} />
          <StatCard icon={<ShieldCheck className="size-4 text-blue-600" />} label="Remaining" value={totalRemaining.toLocaleString("en-IN")} />
          <StatCard icon={<AlertTriangle className="size-4 text-amber-500" />} label="Low Stock Prizes" value={lowStock.length.toString()} />
        </div>

        {rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-12 text-center">
            <Gift className="size-8 text-neutral-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-neutral-900">No prizes yet</p>
            <p className="text-xs text-neutral-500 mt-1">Create a campaign with rewards to see inventory here.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Array.from(byCampaign.entries()).map(([id, group]) => (
              <div key={id} className="bg-white rounded-2xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-neutral-100">
                  <h2 className="text-sm font-black text-neutral-900">{group.name}</h2>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">{group.status}</span>
                </div>
                <div className="divide-y divide-neutral-100">
                  {group.rows.map((r) => {
                    const usedPct = pct(r.won_count, r.total_quantity);
                    const isLow = r.total_quantity > 0 && r.remaining / r.total_quantity <= 0.1;
                    const isOut = r.remaining <= 0;
                    return (
                      <div key={r.prize_id} className="px-5 py-4">
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="flex items-center justify-center size-9 rounded-lg shrink-0 overflow-hidden text-white"
                              style={{ backgroundColor: r.background_color ?? "#059669" }}
                            >
                              {r.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={r.image_url} alt={r.prize_name} className="size-full object-cover" />
                              ) : (
                                <Gift className="size-4" />
                              )}
                            </div>
                            <span className="text-sm font-bold text-neutral-900 truncate">{r.prize_name}</span>
                            <span className="shrink-0 text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded-md px-2 py-0.5 border border-neutral-200/60">
                              {PRIZE_TYPE_LABELS[r.prize_type] ?? r.prize_type}
                            </span>
                            {r.is_fallback && (
                              <span className="shrink-0 text-[10px] font-bold text-blue-700 bg-blue-50 rounded-md px-2 py-0.5 border border-blue-100">
                                Fallback
                              </span>
                            )}
                            {isOut && (
                              <span className="shrink-0 text-[10px] font-bold text-red-700 bg-red-50 rounded-md px-2 py-0.5 border border-red-100">
                                Out of stock
                              </span>
                            )}
                            {!isOut && isLow && (
                              <span className="shrink-0 text-[10px] font-bold text-amber-700 bg-amber-50 rounded-md px-2 py-0.5 border border-amber-100">
                                Low
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 text-xs font-bold text-neutral-700">
                            {r.remaining} / {r.total_quantity} left
                          </span>
                        </div>
                        <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isOut ? "bg-red-400" : isLow ? "bg-amber-400" : "bg-emerald-500"}`}
                            style={{ width: `${usedPct}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5 text-[10px] text-neutral-400 font-semibold">
                          <span>{r.won_count} awarded</span>
                          <span>Weight {r.weight}{r.prize_value != null ? ` · ₹${r.prize_value}` : ""}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </MerchantShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-neutral-200 shadow-sm p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-2xl font-black text-neutral-900 mt-1.5">{value}</p>
    </div>
  );
}
