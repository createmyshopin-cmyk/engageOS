import React from "react";
import {
  Activity,
  Archive,
  BadgeCheck,
  Ban,
  Copy,
  Download,
  Eye,
  Gift,
  LogIn,
  type LucideIcon,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Printer,
  QrCode,
  Send,
  Settings,
  Share2,
  Ticket,
  Trash2,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import type {
  CampaignEventActor,
  CampaignEventType,
  CampaignTimelineEvent,
} from "@/lib/types";

/**
 * Presentation metadata for every tracked campaign event. Kept in one place so
 * the campaign timeline (merchant + admin) and the dashboard Recent Events feed
 * render each event type consistently.
 */
const EVENT_META: Record<
  CampaignEventType,
  { label: string; icon: LucideIcon; tone: string; dot: string }
> = {
  "campaign.created": { label: "Campaign created", icon: Megaphone, tone: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]" },
  "campaign.updated": { label: "Campaign updated", icon: Pencil, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "campaign.published": { label: "Campaign published", icon: BadgeCheck, tone: "bg-[#DBEAFE] text-[#2563EB]", dot: "bg-[#2563EB]" },
  "campaign.activated": { label: "Campaign activated", icon: Play, tone: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]" },
  "campaign.paused": { label: "Campaign paused", icon: Pause, tone: "bg-amber-50 text-amber-600", dot: "bg-amber-400" },
  "campaign.resumed": { label: "Campaign resumed", icon: Play, tone: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]" },
  "campaign.ended": { label: "Campaign ended", icon: Ban, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "campaign.deleted": { label: "Campaign deleted", icon: Trash2, tone: "bg-red-50 text-red-600", dot: "bg-red-400" },
  "campaign.duplicated": { label: "Campaign duplicated", icon: Copy, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "campaign.viewed": { label: "Campaign viewed", icon: Eye, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "campaign.shared": { label: "Campaign shared", icon: Share2, tone: "bg-[#DBEAFE] text-[#2563EB]", dot: "bg-[#2563EB]" },
  "campaign.archived": { label: "Campaign archived", icon: Archive, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "qr.generated": { label: "QR generated", icon: QrCode, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "qr.downloaded": { label: "QR downloaded", icon: Download, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "qr.printed": { label: "QR printed", icon: Printer, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "poster.printed": { label: "Poster printed", icon: Printer, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "customer.scan": { label: "QR scanned", icon: QrCode, tone: "bg-[#DBEAFE] text-[#2563EB]", dot: "bg-[#2563EB]" },
  "customer.registered": { label: "Customer registered", icon: UserPlus, tone: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]" },
  "scratch.started": { label: "Scratch started", icon: Activity, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "scratch.completed": { label: "Played", icon: Activity, tone: "bg-[#DBEAFE] text-[#2563EB]", dot: "bg-[#2563EB]" },
  "prize.allocated": { label: "Prize won", icon: Trophy, tone: "bg-amber-50 text-amber-600", dot: "bg-amber-400" },
  "prize.exhausted": { label: "Prizes exhausted", icon: Ban, tone: "bg-red-50 text-red-600", dot: "bg-red-400" },
  "coupon.generated": { label: "Coupon issued", icon: Ticket, tone: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]" },
  "coupon.redeemed": { label: "Coupon redeemed", icon: Gift, tone: "bg-amber-50 text-amber-600", dot: "bg-amber-400" },
  "gift.claimed": { label: "Gift claimed", icon: Gift, tone: "bg-amber-50 text-amber-600", dot: "bg-amber-400" },
  "whatsapp.queue": { label: "WhatsApp queued", icon: Send, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "whatsapp.sent": { label: "WhatsApp sent", icon: Send, tone: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]" },
  "whatsapp.delivered": { label: "WhatsApp delivered", icon: Send, tone: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]" },
  "whatsapp.read": { label: "WhatsApp read", icon: Send, tone: "bg-[#DBEAFE] text-[#2563EB]", dot: "bg-[#2563EB]" },
  "whatsapp.failed": { label: "WhatsApp failed", icon: Ban, tone: "bg-red-50 text-red-600", dot: "bg-red-400" },
  "csv.export": { label: "CSV exported", icon: Download, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "customer.export": { label: "Customers exported", icon: Download, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "merchant.login": { label: "Merchant signed in", icon: LogIn, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "settings.updated": { label: "Settings updated", icon: Settings, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "analytics.viewed": { label: "Analytics viewed", icon: Eye, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  // V1.1 — Rewards & Sources (migration 0023)
  "reward.created": { label: "Reward created", icon: Gift, tone: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]" },
  "reward.updated": { label: "Reward updated", icon: Pencil, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "reward.deleted": { label: "Reward deleted", icon: Trash2, tone: "bg-red-50 text-red-600", dot: "bg-red-400" },
  "reward.duplicated": { label: "Reward duplicated", icon: Gift, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "reward.enabled": { label: "Reward enabled", icon: Play, tone: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]" },
  "reward.disabled": { label: "Reward disabled", icon: Pause, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "reward.viewed": { label: "Reward viewed", icon: Eye, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "reward.claimed": { label: "Reward claimed", icon: Gift, tone: "bg-amber-50 text-amber-600", dot: "bg-amber-400" },
  "source.created": { label: "Source created", icon: Share2, tone: "bg-[#DBEAFE] text-[#2563EB]", dot: "bg-[#2563EB]" },
  "source.updated": { label: "Source updated", icon: Pencil, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "source.deleted": { label: "Source deleted", icon: Trash2, tone: "bg-red-50 text-red-600", dot: "bg-red-400" },
  "redirect.enabled": { label: "Redirect enabled", icon: Play, tone: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]" },
  "redirect.disabled": { label: "Redirect disabled", icon: Pause, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "redirect.updated": { label: "Redirect updated", icon: Pencil, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "redirect.started": { label: "Redirect started", icon: Activity, tone: "bg-[#DBEAFE] text-[#2563EB]", dot: "bg-[#2563EB]" },
  "redirect.opened": { label: "Redirect opened", icon: Eye, tone: "bg-[#F3F4F6] text-[#6B7280]", dot: "bg-[#9CA3AF]" },
  "redirect.completed": { label: "Redirect completed", icon: BadgeCheck, tone: "bg-[#DCFCE7] text-[#16A34A]", dot: "bg-[#16A34A]" },
  "redirect.cancelled": { label: "Redirect cancelled", icon: Ban, tone: "bg-red-50 text-red-600", dot: "bg-red-400" },
};

const FALLBACK_META = {
  label: "Activity",
  icon: Activity,
  tone: "bg-[#F3F4F6] text-[#6B7280]",
  dot: "bg-[#9CA3AF]",
};

const ACTOR_LABEL: Record<CampaignEventActor, string> = {
  platform_admin: "Platform Admin",
  merchant_owner: "Owner",
  merchant_manager: "Manager",
  merchant_staff: "Staff",
  customer: "Customer",
  system: "System",
  worker: "Worker",
  cron: "Scheduler",
};

export function eventMeta(type: CampaignEventType) {
  return EVENT_META[type] ?? FALLBACK_META;
}

/** Relative "time ago" from an ISO timestamp (server-rendered, deterministic). */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Short human detail line derived from an event's metadata. */
function detailFor(type: CampaignEventType, meta: Record<string, unknown>): string | null {
  const s = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : null);
  switch (type) {
    case "prize.allocated":
    case "coupon.redeemed":
    case "gift.claimed":
      return s("prizeName") ?? s("customerName");
    case "coupon.generated":
      return s("couponCode");
    case "customer.registered":
      return s("customerName");
    case "whatsapp.queue":
      return typeof meta.requeued === "number" ? `${meta.requeued} re-queued` : null;
    case "customer.export":
    case "csv.export":
      return typeof meta.rowCount === "number" ? `${meta.rowCount} rows` : null;
    default:
      return s("campaignName") ?? s("to");
  }
}

interface CampaignEventsTimelineProps {
  events: CampaignTimelineEvent[];
  title?: string;
}

/**
 * Vertical, newest-first timeline of immutable campaign events for a single
 * campaign. Pure presentation over the campaign_events log — the merchant's
 * source of truth for what happened and when.
 */
export function CampaignEventsTimeline({
  events,
  title = "Campaign Timeline",
}: CampaignEventsTimelineProps) {
  return (
    <div className="rounded-2xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
        <h3 className="text-sm font-black text-[#111827]">{title}</h3>
        <span className="text-[11px] font-bold text-[#9CA3AF]">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center px-5">
          <p className="text-sm font-bold text-[#111827]">No activity yet</p>
          <p className="text-xs text-[#6B7280] mt-1">
            Lifecycle events appear here as your campaign runs.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-[#F3F4F6]">
          {events.map((e) => {
            const m = eventMeta(e.event_type);
            const Icon = m.icon;
            const detail = detailFor(e.event_type, e.metadata ?? {});
            return (
              <li key={e.id} className="flex items-start gap-3 px-5 py-3">
                <div
                  className={`flex items-center justify-center size-8 rounded-xl shrink-0 ${m.tone}`}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[#111827] leading-tight">
                    {m.label}
                    {detail && (
                      <span className="font-medium text-[#6B7280]"> · {detail}</span>
                    )}
                  </p>
                  <p className="text-[10px] text-[#9CA3AF] mt-1 font-medium">
                    {ACTOR_LABEL[e.actor_type] ?? e.actor_type} · {timeAgo(e.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// Re-export for the dashboard feed (shares the same actor labels).
export { ACTOR_LABEL };
export { Users, QrCode };
