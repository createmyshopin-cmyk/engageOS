import React from "react";
import {
  Megaphone,
  Printer,
  Send,
  Users,
  Gift,
  BarChart3,
} from "lucide-react";

interface QuickActionsProps {
  merchantSlug: string;
  printSlug: string;
  csvUrl: string;
}

const ACTIONS = [
  {
    icon: Megaphone,
    label: "New Campaign",
    color: "bg-[#DCFCE7] text-[#16A34A]",
    href: "#",
  },
  {
    icon: Printer,
    label: "Print QR",
    color: "bg-[#F3F4F6] text-[#374151]",
    href: null, // set from prop
    key: "print",
  },
  {
    icon: Send,
    label: "Send Offer",
    color: "bg-[#DCFCE7] text-[#16A34A]",
    href: "#",
  },
  {
    icon: Users,
    label: "View Customers",
    color: "bg-[#F3F4F6] text-[#374151]",
    href: null,
    key: "csv",
  },
  {
    icon: Gift,
    label: "Rewards",
    color: "bg-[#DCFCE7] text-[#16A34A]",
    href: "#",
  },
  {
    icon: BarChart3,
    label: "View Reports",
    color: "bg-[#F3F4F6] text-[#374151]",
    href: "#",
  },
] as const;

export function QuickActions({ merchantSlug, printSlug, csvUrl }: QuickActionsProps) {
  const hrefs: Record<string, string> = {
    print: `/m/campaigns/print/${merchantSlug}/${printSlug}`,
    csv: csvUrl,
  };

  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm p-5">
      <h3 className="text-sm font-black text-[#111827] mb-4">Quick Actions</h3>
      <div className="grid grid-cols-3 gap-3">
        {ACTIONS.map(({ icon: Icon, label, color, href, ...rest }) => {
          const key = (rest as { key?: string }).key;
          const finalHref = key ? (hrefs[key] ?? "#") : (href ?? "#");
          return (
            <a
              key={label}
              href={finalHref}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border border-[#E5E7EB] hover:border-[#16A34A]/30 hover:shadow-sm transition-all group cursor-pointer"
            >
              <div
                className={`flex items-center justify-center size-10 rounded-xl ${color} transition-transform group-hover:scale-110`}
              >
                <Icon className="size-5" />
              </div>
              <span className="text-[10px] font-bold text-[#374151] text-center leading-tight">
                {label}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
