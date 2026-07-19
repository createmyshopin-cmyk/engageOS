"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "All campaigns", href: "/m/campaigns" },
  { label: "Analytics", href: "/m/analytics" },
] as const;

export function CampaignsSectionNav() {
  const pathname = usePathname();

  return (
    <nav
      className="flex flex-wrap gap-1.5"
      aria-label="Campaigns section"
    >
      {TABS.map((tab) => {
        const active =
          tab.href === "/m/campaigns"
            ? pathname === "/m/campaigns" || pathname.startsWith("/m/campaigns/")
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-3.5 py-2 rounded-full text-xs font-bold transition ${
              active
                ? "bg-neutral-900 text-white"
                : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
