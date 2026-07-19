"use client";

import { Package, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";
import type { ProductStockDTO } from "@/lib/api/types";

const STOCK_STYLES = {
  in_stock: {
    label: "In stock",
    className: "bg-emerald-600/95 text-white",
    icon: CheckCircle2,
  },
  low_stock: {
    label: "Low stock",
    className: "bg-amber-500/95 text-white",
    icon: AlertCircle,
  },
  out_of_stock: {
    label: "Out of stock",
    className: "bg-neutral-800/85 text-white",
    icon: Package,
  },
  unknown: {
    label: "Stock unknown",
    className: "bg-neutral-500/80 text-white",
    icon: HelpCircle,
  },
} as const;

interface Props {
  stock: ProductStockDTO;
  compact?: boolean;
}

export function ProductStockBadge({ stock, compact = false }: Props) {
  const style = STOCK_STYLES[stock.status];
  const Icon = style.icon;
  const qty =
    stock.available !== null && stock.status !== "unknown" ? ` · ${stock.available}` : "";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold uppercase shadow-sm backdrop-blur-sm ${style.className} ${
        compact ? "px-2 py-0.5 text-[8px]" : "px-2.5 py-1 text-[9px]"
      }`}
    >
      <Icon className={compact ? "size-2.5" : "size-3"} />
      {style.label}
      {qty}
    </span>
  );
}

export function stockFilterLabel(filter: string): string {
  switch (filter) {
    case "in_stock":
      return "In stock";
    case "low_stock":
      return "Low stock";
    case "out_of_stock":
      return "Out of stock";
    default:
      return "All stock";
  }
}
