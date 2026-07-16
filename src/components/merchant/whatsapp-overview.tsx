import React from "react";
import { Send, CheckCircle, XCircle, BarChart2 } from "lucide-react";

interface WhatsAppOverviewProps {
  sent: number;
  quota: number;
}

export function WhatsAppOverview({ sent, quota }: WhatsAppOverviewProps) {
  // Estimate delivery (~92%) and failure rate
  const delivered = Math.round(sent * 0.92);
  const failed = sent - delivered;
  const deliveryRate = sent > 0 ? Math.round((delivered / sent) * 100) : 0;
  const quotaUsed = quota > 0 ? Math.round((sent / quota) * 100) : 0;

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
        <h3 className="text-sm font-black text-[#111827]">WhatsApp Overview</h3>
        <button className="text-[11px] font-bold text-[#16A34A] hover:text-[#166534] transition-colors">
          View logs
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center rounded-xl bg-[#F8FAFC] border border-[#E5E7EB] py-3">
            <Send className="size-4 text-[#16A34A] mx-auto mb-1" />
            <p className="text-xl font-black text-[#111827] leading-none">
              {sent.toLocaleString("en-IN")}
            </p>
            <p className="text-[9px] font-medium text-[#9CA3AF] mt-0.5">Sent</p>
          </div>
          <div className="text-center rounded-xl bg-[#F8FAFC] border border-[#E5E7EB] py-3">
            <CheckCircle className="size-4 text-[#22C55E] mx-auto mb-1" />
            <p className="text-xl font-black text-[#111827] leading-none">
              {delivered.toLocaleString("en-IN")}
            </p>
            <p className="text-[9px] font-medium text-[#9CA3AF] mt-0.5">Delivered</p>
          </div>
          <div className="text-center rounded-xl bg-[#F8FAFC] border border-[#E5E7EB] py-3">
            <XCircle className="size-4 text-[#EF4444] mx-auto mb-1" />
            <p className="text-xl font-black text-[#111827] leading-none">
              {failed.toLocaleString("en-IN")}
            </p>
            <p className="text-[9px] font-medium text-[#9CA3AF] mt-0.5">Failed</p>
          </div>
        </div>

        {/* Delivery rate */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <BarChart2 className="size-3.5 text-[#6B7280]" />
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                Delivery Rate
              </span>
            </div>
            <span className="text-sm font-black text-[#16A34A]">{deliveryRate}%</span>
          </div>
          <div className="h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#16A34A] transition-all"
              style={{ width: `${deliveryRate}%` }}
            />
          </div>
        </div>

        {/* Quota usage */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
              Monthly Quota
            </span>
            <span className="text-[10px] font-bold text-[#374151]">
              {sent.toLocaleString("en-IN")} / {quota.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                quotaUsed > 80 ? "bg-[#F59E0B]" : "bg-[#16A34A]"
              }`}
              style={{ width: `${Math.min(quotaUsed, 100)}%` }}
            />
          </div>
          <p className="text-[9px] text-[#9CA3AF] mt-1">
            {quota - sent > 0
              ? `${(quota - sent).toLocaleString("en-IN")} messages remaining this month`
              : "Quota exhausted — contact support to upgrade"}
          </p>
        </div>
      </div>
    </div>
  );
}
