"use client";

/**
 * ProductCouponDrawer — coupon redemption history for a single product.
 *
 * Opens when a merchant clicks a product that has EngageOS coupon redemptions.
 * Shows who applied which Shopify discount code and when.
 */

import { useEffect } from "react";
import {
  X,
  Ticket,
  Loader2,
  AlertTriangle,
  User,
  Copy,
  Check,
} from "lucide-react";
import { useState } from "react";
import { useProductCouponRedemptions } from "@/lib/api/hooks/use-products";
import type { ProductListItemDTO } from "@/lib/api/types";
import { ProductImage } from "@/components/merchant/products/product-image";
import { ProductStockBadge } from "@/components/merchant/products/product-stock-badge";

interface Props {
  product: ProductListItemDTO | null;
  onClose: () => void;
}

function money(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
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
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-violet-50 text-violet-700 text-[10px] font-bold font-mono hover:bg-violet-100 transition"
      title="Copy code"
    >
      <Ticket className="size-3 shrink-0" />
      {code}
      {copied ? <Check className="size-3" /> : <Copy className="size-3 opacity-50" />}
    </button>
  );
}

export function ProductCouponDrawer({ product, onClose }: Props) {
  const { data, isLoading, isError } = useProductCouponRedemptions(product?.id ?? null);
  const bundle = data?.data;
  const redemptions = bundle?.redemptions ?? [];
  const stats = bundle?.product?.couponStats ?? product?.couponStats;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!product) return null;

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
        aria-label={`Coupon redemptions for ${product.title}`}
      >
        <header className="flex items-start justify-between gap-4 p-5 border-b border-neutral-100">
          <div className="flex gap-3 min-w-0">
            <ProductImage
              src={product.imageUrl}
              title={product.title}
              variant="thumb"
            />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600">
                Coupon redemptions
              </p>
              <h2 className="font-black text-neutral-900 text-sm leading-tight line-clamp-2">
                {product.title ?? "Untitled product"}
              </h2>
              <div className="mt-1.5">
                <ProductStockBadge stock={bundle?.product?.stock ?? product.stock} compact />
              </div>
              {stats && (
                <p className="text-[11px] text-neutral-500 mt-1">
                  {stats.customerCount} customer{stats.customerCount === 1 ? "" : "s"} ·{" "}
                  {stats.redemptionCount} order{stats.redemptionCount === 1 ? "" : "s"} ·{" "}
                  {money(stats.revenue)} revenue
                </p>
              )}
            </div>
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

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-neutral-400">
              <Loader2 className="size-6 animate-spin text-emerald-500" />
              <p className="text-xs font-semibold">Loading redemptions…</p>
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <AlertTriangle className="size-7 text-red-400" />
              <p className="text-xs text-neutral-500">Couldn&apos;t load redemption history.</p>
            </div>
          ) : redemptions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Ticket className="size-8 text-neutral-200" />
              <p className="text-sm font-bold text-neutral-900">No coupon redemptions yet</p>
              <p className="text-xs text-neutral-500 max-w-xs">
                When customers apply your EngageOS Shopify coupon codes on orders containing this
                product, they&apos;ll show up here.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {redemptions.map((r, i) => (
                <li
                  key={`${r.orderId}-${i}`}
                  className="rounded-2xl border border-neutral-200/80 bg-neutral-50/50 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="size-8 rounded-full bg-white border border-neutral-200 flex items-center justify-center shrink-0">
                        <User className="size-3.5 text-neutral-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-neutral-900 truncate">
                          {r.customerName ?? "Guest customer"}
                        </p>
                        <p className="text-[10px] text-neutral-400">{formatDate(r.placedAt)}</p>
                      </div>
                    </div>
                    <CodeChip code={r.discountCode} />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-semibold text-neutral-500">
                    <span>
                      Order {r.orderNumber ?? r.orderId.slice(0, 8)}
                      {r.quantity > 1 ? ` · Qty ${r.quantity}` : ""}
                    </span>
                    <span className="text-neutral-900">{money(r.lineTotal)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>
  );
}
