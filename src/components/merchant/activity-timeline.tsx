import React from "react";
import { Users, Gift, Megaphone, QrCode } from "lucide-react";

interface ActivityItem {
  type: "customer_joined" | "coupon_redeemed" | "campaign_started" | "qr_printed";
  label: string;
  sub?: string;
  time: string;
}

interface ActivityTimelineProps {
  items: ActivityItem[];
}

const TYPE_CONFIG = {
  customer_joined: {
    icon: Users,
    color: "bg-[#DCFCE7] text-[#16A34A]",
    dot: "bg-[#16A34A]",
  },
  coupon_redeemed: {
    icon: Gift,
    color: "bg-amber-50 text-amber-600",
    dot: "bg-amber-400",
  },
  campaign_started: {
    icon: Megaphone,
    color: "bg-[#DCFCE7] text-[#16A34A]",
    dot: "bg-[#16A34A]",
  },
  qr_printed: {
    icon: QrCode,
    color: "bg-[#F3F4F6] text-[#6B7280]",
    dot: "bg-[#9CA3AF]",
  },
};

export function ActivityTimeline({ items }: ActivityTimelineProps) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
        <h3 className="text-sm font-black text-[#111827]">Recent Activity</h3>
        <button className="text-[11px] font-bold text-[#16A34A] hover:text-[#166534] transition-colors">
          View all
        </button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center px-5">
          <p className="text-sm font-bold text-[#111827]">No activity yet</p>
          <p className="text-xs text-[#6B7280] mt-1">
            Activity will appear here once customers start scanning your QR code.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#F3F4F6]">
          {items.slice(0, 4).map((item, idx) => {
            const config = TYPE_CONFIG[item.type];
            const Icon = config.icon;
            return (
              <div key={idx} className="bg-white px-4 py-4 flex flex-col gap-2">
                <div
                  className={`flex items-center justify-center size-9 rounded-xl ${config.color} shrink-0`}
                >
                  <Icon className="size-4.5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#111827] leading-tight">
                    {item.label}
                  </p>
                  {item.sub && (
                    <p className="text-[10px] text-[#6B7280] mt-0.5">{item.sub}</p>
                  )}
                  <p className="text-[9px] text-[#9CA3AF] mt-1.5 font-medium">
                    {item.time}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
