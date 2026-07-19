"use client";

/**
 * OrderDetailDrawer — full order detail for `/m/orders`.
 *
 * Opens when a merchant clicks an order attributed to an EngageOS campaign
 * coupon. Shows customer, financial status, the used discount code, campaign
 * name, and line items.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  Ticket,
  Loader2,
  AlertTriangle,
  User,
  Copy,
  Check,
  ShoppingBag,
} from "lucide-react";
import { useOrderDetail } from "@/lib/api/hooks/use-orders";
import type { OrderListItemDTO } from "@/lib/api/types";

interface Props {
  order: OrderListItemDTO | null;
  onClose: () => void;
}

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${currency} ${n}`;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CodeChip({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!code) return <span className="text-neutral-400 text-xs">—</span>;

  const copy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-50 text-violet-700 text-[10px] font-bold font-mono hover:bg-violet-100 transition"
      title="Copy code"
    >
      <Ticket className="size-3 shrink-0" />
      {code}
      {copied ? <Check className="size-3" /> : <Copy className="size-3 opacity-50" />}
    </button>
  );
}

export function OrderDetailDrawer({ order, onClose }: Props) {
  const { data, isLoading, isError } = useOrderDetail(order?.id ?? null);
  const detail = data?.data;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!order) return null;

  const currency = detail?.currency ?? order.currency;
  const label = order.orderNumber ? `#${order.orderNumber}` : order.id.slice(0, 8);

  return (
    <>
      <div
        className="fixed inset-0 bg-neutral-900/40 backdrop-blur-[2px] z-40"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
        role="dialog"
        aria-label={`Order ${label}`}
      >
        <header className="flex items-start justify-between gap-4 p-5 border-b border-neutral-100">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
              Order detail
            </p>
            <h2 className="font-black text-neutral-900 text-lg leading-tight">{label}</h2>
            <p className="text-[11px] text-neutral-500 mt-1">{formatDate(order.placedAt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-neutral-700 transition"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-400">
              <Loader2 className="size-6 animate-spin text-emerald-500" />
              <p className="text-xs font-semibold">Loading order…</p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <AlertTriangle className="size-7 text-red-400" />
              <p className="text-xs text-neutral-500">Couldn&apos;t load order details.</p>
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-full bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                    <User className="size-3.5 text-neutral-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-900 truncate">
                      {detail?.customerName ?? order.customerName ?? order.customerPhone ?? "Guest"}
                    </p>
                    {(detail?.customerPhone ?? order.customerPhone) && (
                      <p className="text-[10px] text-neutral-400">
                        {detail?.customerPhone ?? order.customerPhone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex px-2 py-0.5 rounded-full bg-white border border-neutral-200 text-[10px] font-bold text-neutral-600 capitalize">
                    {detail?.financialStatus ?? order.financialStatus ?? "unknown"}
                  </span>
                  {(detail?.fulfillmentStatus ?? order.fulfillmentStatus) && (
                    <span className="inline-flex px-2 py-0.5 rounded-full bg-white border border-neutral-200 text-[10px] font-bold text-neutral-600 capitalize">
                      {detail?.fulfillmentStatus ?? order.fulfillmentStatus}
                    </span>
                  )}
                </div>
              </section>

              {(detail?.discountCode ?? order.discountCode) && (
                <section className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                    Campaign coupon used
                  </p>
                  <CodeChip code={detail?.discountCode ?? order.discountCode} />
                  {(detail?.campaignName ?? order.campaignName) && (
                    <p className="text-xs text-neutral-600">
                      Campaign:{" "}
                      {(detail?.campaignId ?? order.campaignId) ? (
                        <Link
                          href={`/m/campaigns/${detail?.campaignId ?? order.campaignId}`}
                          className="font-bold text-neutral-900 hover:text-emerald-700 transition"
                        >
                          {detail?.campaignName ?? order.campaignName}
                        </Link>
                      ) : (
                        <span className="font-bold text-neutral-900">
                          {detail?.campaignName ?? order.campaignName}
                        </span>
                      )}
                    </p>
                  )}
                  {(detail?.totalDiscount ?? order.totalDiscount) != null &&
                    (detail?.totalDiscount ?? order.totalDiscount)! > 0 && (
                      <p className="text-[11px] font-semibold text-emerald-700">
                        Discount applied:{" "}
                        {money(detail?.totalDiscount ?? order.totalDiscount ?? 0, currency)}
                      </p>
                    )}
                </section>
              )}

              <section>
                <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-2">
                  Line items
                </p>
                {detail?.items?.length ? (
                  <ul className="space-y-2">
                    {detail.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200/80 bg-white px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-neutral-900 truncate">
                            {item.title ?? "Untitled item"}
                          </p>
                          <p className="text-[10px] text-neutral-400">
                            Qty {item.quantity}
                            {item.sku ? ` · ${item.sku}` : ""}
                          </p>
                        </div>
                        <p className="text-xs font-black text-neutral-900 shrink-0">
                          {money(item.lineTotal, currency)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-dashed border-neutral-200 py-8 text-center">
                    <ShoppingBag className="size-6 text-neutral-300 mx-auto" />
                    <p className="text-xs text-neutral-400 mt-2">No line items synced yet.</p>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 space-y-1.5">
                {detail?.subtotal != null && (
                  <div className="flex justify-between text-[11px] text-neutral-500">
                    <span>Subtotal</span>
                    <span>{money(detail.subtotal, currency)}</span>
                  </div>
                )}
                {detail?.totalTax != null && detail.totalTax > 0 && (
                  <div className="flex justify-between text-[11px] text-neutral-500">
                    <span>Tax</span>
                    <span>{money(detail.totalTax, currency)}</span>
                  </div>
                )}
                {(detail?.totalDiscount ?? order.totalDiscount) != null &&
                  (detail?.totalDiscount ?? order.totalDiscount)! > 0 && (
                    <div className="flex justify-between text-[11px] text-emerald-700">
                      <span>Discount</span>
                      <span>
                        −{money(detail?.totalDiscount ?? order.totalDiscount ?? 0, currency)}
                      </span>
                    </div>
                  )}
                <div className="flex justify-between text-sm font-black text-neutral-900 pt-1 border-t border-neutral-200">
                  <span>Total</span>
                  <span>{money(detail?.totalPrice ?? order.totalPrice, currency)}</span>
                </div>
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
