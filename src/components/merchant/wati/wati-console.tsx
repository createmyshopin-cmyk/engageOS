"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Workflow,
  BarChart3,
  Ticket,
} from "lucide-react";
import { WatiOverviewTab } from "./overview-tab";
import { WatiTemplatesTab } from "./templates-tab";
import { WatiAutomationTab } from "./automation-tab";
import { WatiAnalyticsTab } from "./analytics-tab";
import { WatiSettings } from "./wati-settings";

const TABS = [
  { key: "overview", label: "Overview", shortLabel: "Overview", icon: LayoutDashboard },
  { key: "templates", label: "Templates", shortLabel: "Templates", icon: FileText },
  { key: "automation", label: "Automation", shortLabel: "Auto", icon: Workflow },
  { key: "coupons", label: "Coupon Delivery", shortLabel: "Coupons", icon: Ticket },
  { key: "analytics", label: "Analytics", shortLabel: "Stats", icon: BarChart3 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const TAB_KEYS = new Set<string>(TABS.map((t) => t.key));

function isTabKey(value: string | null): value is TabKey {
  return value !== null && TAB_KEYS.has(value);
}

/**
 * The WATI console. Appears in the sidebar once a merchant connects WATI.
 * Tabbed merchant console; every tab talks to the tenant's
 * own WATI gateway (API v3) through the /api/m/wati and
 * /api/m/integrations/wati adapters — the browser never sees the token.
 */
export function WatiConsole({ baseUrl }: { baseUrl: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get("tab");

  const [tab, setTab] = useState<TabKey>(() =>
    isTabKey(tabFromUrl) ? tabFromUrl : "overview"
  );

  useEffect(() => {
    if (isTabKey(tabFromUrl) && tabFromUrl !== tab) {
      setTab(tabFromUrl);
    }
  }, [tabFromUrl, tab]);

  const goToTab = useCallback(
    (key: TabKey) => {
      setTab(key);
      const params = new URLSearchParams(searchParams.toString());
      if (key === "overview") params.delete("tab");
      else params.set("tab", key);
      const qs = params.toString();
      router.replace(qs ? `/m/wati?${qs}` : "/m/wati", { scroll: false });
    },
    [router, searchParams]
  );

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="WATI console sections"
        className="flex items-center gap-1 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 overflow-x-auto scrollbar-thin"
      >
        {TABS.map(({ key, label, shortLabel, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`wati-panel-${key}`}
              id={`wati-tab-${key}`}
              onClick={() => goToTab(key)}
              className={`flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 ${
                active
                  ? "bg-[#3B82F6] text-white shadow-md shadow-blue-500/20"
                  : "text-[#6B7280] hover:text-[#111827] hover:bg-[#F8FAFC]"
              }`}
            >
              <Icon className="size-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`wati-panel-${tab}`}
        aria-labelledby={`wati-tab-${tab}`}
      >
        {tab === "overview" ? (
          <WatiOverviewTab onGoTo={(k) => isTabKey(k) && goToTab(k)} />
        ) : tab === "templates" ? (
          <WatiTemplatesTab baseUrl={baseUrl} />
        ) : tab === "automation" ? (
          <WatiAutomationTab baseUrl={baseUrl} onGoTo={(k) => isTabKey(k) && goToTab(k)} />
        ) : tab === "coupons" ? (
          <WatiSettings variant="console" />
        ) : (
          <WatiAnalyticsTab />
        )}
      </div>
    </div>
  );
}
