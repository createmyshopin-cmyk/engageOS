"use client";

import React, { useEffect, useState } from "react";
import {
  Workflow,
  Trophy,
  UserCheck,
  ExternalLink,
  Ticket,
  ArrowRight,
  Bot,
  Webhook,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { fetchWatiConsole } from "./api";

/**
 * Automation tab. Two layers:
 *  1. EngageOS-driven automation we own end-to-end — auto-send a WATI template
 *     the moment a customer wins (coupon) or plays without winning
 *     (participation). Configured on the Coupon Delivery tab; summarised here.
 *  2. WATI-native automation (keyword bots, chatbots, office-hours replies)
 *     that lives in the WATI workspace. WATI API v3 has no automation-authoring
 *     endpoint, so we deep-link rather than fake a builder.
 */
export function WatiAutomationTab({
  baseUrl,
  onGoTo,
}: {
  baseUrl: string | null;
  onGoTo: (tab: string) => void;
}) {
  const base = baseUrl ? baseUrl.replace(/\/+$/, "") : null;

  return (
    <div className="space-y-5">
      {/* Inbound webhook — delivery receipts + replies */}
      <WatiWebhookCard />

      {/* EngageOS automations */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <div className="flex items-center gap-2">
          <Workflow className="size-4 text-[#3B82F6]" />
          <h3 className="text-sm font-black text-[#111827]">EngageOS automations</h3>
        </div>
        <p className="mt-1 max-w-2xl text-[11px] font-medium leading-relaxed text-[#6B7280]">
          These run automatically inside EngageOS the moment a customer plays a campaign — no WATI
          setup beyond an approved template. Turn them on and pick a template on the Coupon Delivery
          tab.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <AutomationCard
            icon={Trophy}
            title="Coupon on win"
            body="When a customer wins a prize, EngageOS instantly sends your approved coupon template with their name, prize, and code filled in."
            trigger="Trigger: customer wins"
          />
          <AutomationCard
            icon={UserCheck}
            title="Participation on play"
            body="When a customer plays but doesn’t win, EngageOS sends a thank-you / come-back template — keeping every walk-in engaged, not just winners."
            trigger="Trigger: customer plays, no win"
          />
        </div>

        <button
          onClick={() => onGoTo("coupons")}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#3B82F6] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#2563EB] transition-colors"
        >
          <Ticket className="size-3.5" />
          Configure templates & toggles
          <ArrowRight className="size-3.5" />
        </button>
      </div>

      {/* WATI-native automations */}
      <div className="rounded-2xl border border-[#E5E7EB] bg-white p-5">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-[#3B82F6]" />
          <h3 className="text-sm font-black text-[#111827]">WATI chatbots & keyword replies</h3>
        </div>
        <p className="mt-2 max-w-2xl text-[11px] font-medium leading-relaxed text-[#6B7280]">
          Conversational automations — keyword auto-replies, chatbot flows, and office-hours
          responders — are built and run inside your WATI workspace. Every customer EngageOS
          messages becomes a WATI contact, so bots you build there trigger on the same conversations.
          WATI’s API doesn’t expose an automation builder, so manage these in WATI directly.
        </p>
        {(() => {
          const matches = baseUrl ? baseUrl.match(/\/(\d+)(?:\/|$)/) : null;
          const watiId = matches ? matches[1] : "";
          const automationsUrl = watiId
            ? `https://live.wati.io/${watiId}/automations`
            : base
              ? `${base}/automations`
              : null;

          return automationsUrl ? (
            <a
              href={automationsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#3B82F6]/30 bg-[#EFF6FF] px-4 py-2.5 text-xs font-bold text-[#2563EB] hover:bg-[#DBEAFE] transition-colors"
            >
              <ExternalLink className="size-3.5" />
              Open automations in WATI
            </a>
          ) : (
            <p className="mt-4 text-[11px] font-bold text-[#9CA3AF]">
              Reconnect WATI to open your workspace.
            </p>
          );
        })()}
      </div>
    </div>
  );
}

function AutomationCard({
  icon: Icon,
  title,
  body,
  trigger,
}: {
  icon: typeof Trophy;
  title: string;
  body: string;
  trigger: string;
}) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] p-4">
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center size-8 rounded-xl bg-[#EFF6FF]">
          <Icon className="size-4 text-[#3B82F6]" />
        </div>
        <p className="text-xs font-black text-[#111827]">{title}</p>
      </div>
      <p className="mt-2 text-[11px] font-medium leading-relaxed text-[#6B7280]">{body}</p>
      <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[#9CA3AF]">
        {trigger}
      </p>
    </div>
  );
}

/**
 * Inbound webhook setup. Surfaces the tenant's unique callback URL (with its
 * secret token) so the merchant can paste it into WATI → Webhooks. Once wired,
 * WATI posts delivery receipts (Sent/Delivered/Read/Failed) and inbound replies
 * back to EngageOS, which updates coupon status, timestamps, and analytics.
 */
function WatiWebhookCard() {
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchWatiConsole("/api/m/integrations/wati")
      .then((s) => {
        if (alive) setWebhookUrl(typeof s.webhookUrl === "string" ? s.webhookUrl : null);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const copy = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div className="rounded-2xl border border-[#3B82F6]/25 bg-[#EFF6FF] p-5">
      <div className="flex items-center gap-2">
        <Webhook className="size-4 text-[#3B82F6]" />
        <h3 className="text-sm font-black text-[#111827]">Delivery receipts & replies (webhook)</h3>
      </div>
      <p className="mt-2 max-w-2xl text-[11px] font-medium leading-relaxed text-[#4B5563]">
        Paste this URL into WATI → <span className="font-bold">Connectors / Webhooks → Add Webhook</span>,
        enable it, and subscribe to the message + template-status events. WATI will then report
        Sent → Delivered → Read → Failed back to EngageOS, keeping coupon status and analytics live.
        This URL contains your private token — treat it like a password.
      </p>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-[11px] font-bold text-[#6B7280]">
          <Loader2 className="size-3.5 animate-spin text-[#3B82F6]" /> Loading webhook URL…
        </div>
      ) : webhookUrl ? (
        <div className="mt-4 flex items-stretch gap-2">
          <code className="min-w-0 flex-1 truncate rounded-xl border border-[#3B82F6]/20 bg-white px-3.5 py-2.5 text-[11px] font-medium text-[#111827]">
            {webhookUrl}
          </code>
          <button
            onClick={copy}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#3B82F6] px-3.5 py-2.5 text-xs font-bold text-white shadow-md shadow-blue-500/20 hover:bg-[#2563EB] transition-colors"
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <p className="mt-4 text-[11px] font-bold text-[#9CA3AF]">
          Reconnect WATI to generate your webhook URL.
        </p>
      )}
    </div>
  );
}
