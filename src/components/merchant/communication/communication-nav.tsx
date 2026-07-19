"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  Users,
  Megaphone,
  BarChart3,
  Settings,
  Sparkles,
} from "lucide-react";

const TABS = [
  { href: "/m/communication/inbox", label: "Inbox", icon: Inbox },
  { href: "/m/communication/contacts", label: "Contacts", icon: Users },
  { href: "/m/communication/broadcasts", label: "Broadcast", icon: Megaphone },
  { href: "/m/communication/reports", label: "Reports", icon: BarChart3 },
  { href: "/m/communication/assistant", label: "Assistant", icon: Sparkles },
  { href: "/m/communication/settings", label: "Settings", icon: Settings },
] as const;

export function CommunicationNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Communication"
      className="flex items-center gap-1 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 overflow-x-auto"
    >
      {TABS.map(({ href, label, icon: Icon }) => {
        const active =
          pathname === href ||
          pathname.startsWith(`${href}/`) ||
          (href === "/m/communication/settings" &&
            pathname.startsWith("/m/communication/advanced"));
        return (
          <Link
            key={href}
            href={href}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors ${
              active
                ? "bg-[#111827] text-white shadow-sm"
                : "text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
