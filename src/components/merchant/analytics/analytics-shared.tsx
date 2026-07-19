"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function PanelHeader({
  icon: Icon,
  title,
  sub,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4 border-b border-neutral-100">
      <div className={`flex items-center justify-center size-9 rounded-xl ${tone}`}>
        <Icon className="size-4.5" />
      </div>
      <div>
        <h2 className="text-sm font-black text-neutral-900">{title}</h2>
        <p className="text-[11px] font-medium text-neutral-400">{sub}</p>
      </div>
    </div>
  );
}

export function EmptyRow({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-14 px-6 text-center">
      <p className="text-xs font-semibold text-neutral-400">{message}</p>
    </div>
  );
}

export function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="size-11 rounded-2xl bg-red-50 flex items-center justify-center mb-3">
        <AlertTriangle className="size-6 text-red-400" />
      </div>
      <p className="text-xs text-neutral-500 max-w-xs">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-2 bg-neutral-900 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-neutral-800 transition"
      >
        <RefreshCw className="size-3.5" /> Retry
      </button>
    </div>
  );
}

export function UpdatingStrip() {
  return (
    <div className="px-5 py-2 border-b border-neutral-100 bg-emerald-50/50 flex items-center gap-2">
      <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
      <span className="text-[10px] font-semibold text-emerald-700">Updating…</span>
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-32 bg-neutral-100 rounded-3xl animate-pulse" />
      ))}
    </div>
  );
}

export function RowsSkeleton() {
  return (
    <div className="p-5 space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-8 bg-neutral-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 160 }: { height?: number }) {
  return <div className="mx-5 mb-5 bg-neutral-100 rounded-2xl animate-pulse" style={{ height }} />;
}
