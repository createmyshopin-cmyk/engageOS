"use client";

import React, { useState } from "react";
import {
  LayoutDashboard,
  Users,
  Megaphone,
  FileText,
  Inbox,
  Workflow,
  BarChart3,
  Settings,
  ExternalLink,
  Plug,
} from "lucide-react";
import { OverviewTab } from "./overview-tab";
import { ContactsTab } from "./contacts-tab";
import { BroadcastTab } from "./broadcast-tab";
import { InboxTab } from "./inbox-tab";
import { AnalyticsTab } from "./analytics-tab";
import { SettingsTab } from "./settings-tab";

export interface CampaignOption {
  id: string;
  name: string;
  status: string;
}

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "contacts", label: "Contacts", icon: Users },
  { key: "broadcast", label: "Broadcast", icon: Megaphone },
  { key: "templates", label: "Templates", icon: FileText },
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "automation", label: "Automation", icon: Workflow },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
  { key: "settings", label: "Settings", icon: Settings },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Tabs that need a live wacrm connection to be useful. */
const NEEDS_CONNECTION: TabKey[] = [
  "overview",
  "contacts",
  "broadcast",
  "templates",
  "inbox",
  "automation",
  "analytics",
];

export function WhatsAppTabs({
  connected,
  baseUrl,
  campaigns,
}: {
  connected: boolean;
  baseUrl: string | null;
  campaigns: CampaignOption[];
}) {
  const [tab, setTab] = useState<TabKey>(connected ? "overview" : "settings");
  const [isConnected, setIsConnected] = useState(connected);
  const [crmUrl, setCrmUrl] = useState(baseUrl);

  return (
    <div className="space-y-5">
      {/* Pill tab bar (same pattern as campaign-detail-tabs) */}
      <div className="flex items-center gap-1 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              tab === key
                ? "bg-[#16A34A] text-white shadow-md shadow-green-500/20"
                : "text-[#6B7280] hover:text-[#111827] hover:bg-[#F8FAFC]"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {!isConnected && NEEDS_CONNECTION.includes(tab) ? (
        <NotConnected onGoToSettings={() => setTab("settings")} />
      ) : tab === "overview" ? (
        <OverviewTab onGoTo={(k) => setTab(k as TabKey)} />
      ) : tab === "contacts" ? (
        <ContactsTab />
      ) : tab === "broadcast" ? (
        <BroadcastTab campaigns={campaigns} crmUrl={crmUrl} />
      ) : tab === "templates" ? (
        <ExternalPanel
          title="Message Templates"
          body="WhatsApp templates are created, submitted to Meta, and approved inside your wacrm workspace — EngageOS reuses them by name for coupon delivery and broadcasts, so nothing is duplicated. Create a template in wacrm, wait for Meta approval, then reference its exact name in the Broadcast and Settings tabs here."
          crmUrl={crmUrl}
          linkLabel="Manage templates in wacrm"
        />
      ) : tab === "inbox" ? (
        <InboxTab />
      ) : tab === "automation" ? (
        <ExternalPanel
          title="Automations"
          body="Automations (welcome flows, keyword replies, drip sequences) run inside your wacrm workspace. EngageOS feeds them the signals: every registered customer becomes a wacrm contact tagged with the campaign slug, winners get the 'winner' tag and redeemers get 'redeemed' — build wacrm automations that trigger on those tags."
          crmUrl={crmUrl ? `${crmUrl}/automations` : null}
          linkLabel="Open automations in wacrm"
        />
      ) : tab === "analytics" ? (
        <AnalyticsTab />
      ) : (
        <SettingsTab
          onConnectionChange={(ok, url) => {
            setIsConnected(ok);
            setCrmUrl(url);
            if (ok) setTab("overview");
          }}
        />
      )}
    </div>
  );
}

function NotConnected({ onGoToSettings }: { onGoToSettings: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#D1D5DB] bg-white px-6 py-14 text-center">
      <div className="mx-auto mb-4 flex items-center justify-center size-12 rounded-2xl bg-[#DCFCE7]">
        <Plug className="size-6 text-[#16A34A]" />
      </div>
      <h3 className="text-base font-black text-[#111827]">Connect your wacrm workspace</h3>
      <p className="mx-auto mt-1.5 max-w-md text-xs text-[#6B7280] font-medium">
        EngageOS uses wacrm as its WhatsApp CRM — contacts, inbox, templates, broadcasts and
        automations all live there. Paste your wacrm URL and an API key to link this business.
      </p>
      <button
        onClick={onGoToSettings}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-green-500/20 hover:bg-[#15803D] transition-colors"
      >
        <Plug className="size-3.5" />
        Go to Settings
      </button>
    </div>
  );
}

function ExternalPanel({
  title,
  body,
  crmUrl,
  linkLabel,
}: {
  title: string;
  body: string;
  crmUrl: string | null;
  linkLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white p-6">
      <h3 className="text-sm font-black text-[#111827]">{title}</h3>
      <p className="mt-2 max-w-2xl text-xs leading-relaxed text-[#6B7280] font-medium">{body}</p>
      {crmUrl ? (
        <a
          href={crmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#16A34A]/30 bg-[#DCFCE7] px-4 py-2.5 text-xs font-bold text-[#16A34A] hover:bg-[#BBF7D0] transition-colors"
        >
          <ExternalLink className="size-3.5" />
          {linkLabel}
        </a>
      ) : (
        <p className="mt-4 text-xs font-bold text-[#9CA3AF]">
          Connect wacrm in Settings to open your workspace.
        </p>
      )}
    </div>
  );
}
