"use client";

import React, { useState } from "react";
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
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "automation", label: "Automation", icon: Workflow },
  { key: "coupons", label: "Coupon Delivery", icon: Ticket },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * The WATI console. Appears in the sidebar once a merchant connects WATI.
 * Mirrors the /m/whatsapp tabbed layout, but every tab talks to the tenant's
 * own WATI gateway (API v3) through the /api/m/wati and
 * /api/m/integrations/wati adapters — the browser never sees the token.
 */
export function WatiConsole({ baseUrl }: { baseUrl: string | null }) {
  const [tab, setTab] = useState<TabKey>("overview");

  return (
    <div className="space-y-5">
      {/* Pill tab bar — same pattern as the WhatsApp console */}
      <div className="flex items-center gap-1 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              tab === key
                ? "bg-[#3B82F6] text-white shadow-md shadow-blue-500/20"
                : "text-[#6B7280] hover:text-[#111827] hover:bg-[#F8FAFC]"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <WatiOverviewTab onGoTo={(k) => setTab(k as TabKey)} />
      ) : tab === "templates" ? (
        <WatiTemplatesTab baseUrl={baseUrl} />
      ) : tab === "automation" ? (
        <WatiAutomationTab baseUrl={baseUrl} onGoTo={(k) => setTab(k as TabKey)} />
      ) : tab === "coupons" ? (
        <WatiSettings />
      ) : (
        <WatiAnalyticsTab />
      )}
    </div>
  );
}
