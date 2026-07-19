"use client";

import React from "react";
import { X } from "lucide-react";

export function WatiNotice({
  children,
  onDismiss,
}: {
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-[#16A34A]/25 bg-[#F0FDF4] p-4 text-xs font-bold text-[#15803D]">
      <p className="min-w-0 flex-1">{children}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg p-0.5 text-[#15803D]/70 hover:bg-[#DCFCE7] hover:text-[#15803D] transition-colors"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function WatiError({
  children,
  onRetry,
  onDismiss,
}: {
  children: React.ReactNode;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#FCA5A5] bg-[#FEF2F2] p-4 text-xs font-bold text-[#B91C1C]">
      <p className="min-w-0 flex-1">{children}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-xl border border-[#FCA5A5] bg-white px-3 py-1.5 text-[11px] font-bold text-[#B91C1C] hover:bg-[#FEE2E2] transition-colors"
        >
          Retry
        </button>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg p-0.5 text-[#B91C1C]/70 hover:bg-[#FEE2E2] transition-colors"
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
