import React from "react";
import {
  QrCode,
  Calendar,
  Gift,
  Pause,
  ExternalLink,
  Printer,
  Clock,
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  slug: string;
  status: string;
  starts_at: string;
  ends_at: string;
  plays: number;
  wins: number;
  redeemed: number;
}

interface CampaignCardProps {
  campaign: Campaign | null;
  couponsRemaining: number;
  merchantSlug: string;
  printSlug: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CampaignCard({
  campaign,
  couponsRemaining,
  merchantSlug,
  printSlug,
}: CampaignCardProps) {
  if (!campaign) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[#E5E7EB] bg-white p-6 flex flex-col items-center justify-center text-center min-h-[220px]">
        <div className="size-12 rounded-2xl bg-[#DCFCE7] flex items-center justify-center mb-3">
          <Megaphone className="size-5 text-[#16A34A]" />
        </div>
        <p className="text-sm font-bold text-[#111827]">No active campaign</p>
        <p className="text-xs text-[#6B7280] mt-1">
          Contact EngageOS to launch your next campaign.
        </p>
      </div>
    );
  }

  const isActive = campaign.status === "active";

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-[#111827] px-5 py-4 flex items-center justify-between">
        <div>
          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">
            Current Campaign
          </span>
          <p className="text-sm font-black text-white mt-0.5">{campaign.name}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${
            isActive
              ? "bg-[#16A34A] text-white"
              : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${
              isActive ? "bg-white animate-pulse" : "bg-amber-400"
            }`}
          />
          {isActive ? "Active" : campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
        </span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-px bg-[#E5E7EB]">
        <div className="bg-white px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <QrCode className="size-3.5 text-[#6B7280]" />
            <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">
              QR Scans
            </span>
          </div>
          <p className="text-2xl font-black text-[#111827] leading-none">
            {campaign.plays.toLocaleString("en-IN")}
          </p>
          <p className="text-[9px] text-[#22C55E] font-bold mt-0.5">Excellent</p>
        </div>
        <div className="bg-white px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Gift className="size-3.5 text-[#6B7280]" />
            <span className="text-[9px] font-bold text-[#6B7280] uppercase tracking-wider">
              Coupons Left
            </span>
          </div>
          <p className="text-2xl font-black text-[#111827] leading-none">
            {couponsRemaining.toLocaleString("en-IN")}
          </p>
          <p className="text-[9px] text-[#22C55E] font-bold mt-0.5">Excellent</p>
        </div>
      </div>

      {/* Dates */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-[#E5E7EB] bg-[#F8FAFC]">
        <div className="flex items-center gap-1.5">
          <Calendar className="size-3.5 text-[#9CA3AF]" />
          <span className="text-[10px] text-[#6B7280] font-medium">
            <span className="font-bold text-[#111827]">Start:</span>{" "}
            {formatDate(campaign.starts_at)}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="size-3.5 text-[#9CA3AF]" />
          <span className="text-[10px] text-[#6B7280] font-medium">
            <span className="font-bold text-[#111827]">End:</span>{" "}
            {formatDate(campaign.ends_at)}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4 pt-3 space-y-2">
        <a
          href={`/c/${merchantSlug}/${campaign.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full rounded-xl bg-[#16A34A] py-2.5 text-sm font-bold text-white hover:bg-[#166534] transition-colors"
        >
          <ExternalLink className="size-4" />
          View Campaign
        </a>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={`/m/campaigns/print/${merchantSlug}/${printSlug}`}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] py-2 text-xs font-bold text-[#374151] hover:bg-[#F8FAFC] transition-colors"
          >
            <Printer className="size-3.5" />
            Print QR
          </a>
          <button className="flex items-center justify-center gap-1.5 rounded-xl border border-[#E5E7EB] py-2 text-xs font-bold text-[#374151] hover:bg-[#F8FAFC] transition-colors">
            <Pause className="size-3.5" />
            Pause
          </button>
        </div>
      </div>
    </div>
  );
}

function Megaphone({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 11 19-9-9 19-2-8-8-2z" />
    </svg>
  );
}
