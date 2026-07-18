"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Eye,
  Edit3,
  Copy,
  QrCode,
  PauseCircle,
  PlayCircle,
  StopCircle,
  Trash2,
  MoreHorizontal,
  Plus,
  Megaphone,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";
import {
  updateCampaignStatusAction,
  duplicateCampaignAction,
  deleteCampaignAction,
} from "@/app/m/campaigns/actions";
import type { CampaignStatus, CampaignType, Campaign } from "@/lib/types";
import { campaignTypeLabel } from "@/lib/types";

/* ──────────────────────────────────────────────────────────
   CAMPAIGN TYPE BADGE
────────────────────────────────────────────────────────── */
export function CampaignTypeBadge({ type }: { type: CampaignType | null | undefined }) {
  return (
    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
      {campaignTypeLabel(type)}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────
   STATUS BADGE
────────────────────────────────────────────────────────── */
const STATUS_CONFIG: Record<
  CampaignStatus,
  { label: string; class: string; dot?: boolean }
> = {
  active: {
    label: "Active",
    class: "bg-emerald-500/90 text-white",
    dot: true,
  },
  scheduled: { label: "Scheduled", class: "bg-blue-500/90 text-white" },
  draft: { label: "Draft", class: "bg-neutral-600/90 text-white" },
  paused: { label: "Paused", class: "bg-amber-500/90 text-white" },
  completed: { label: "Ended", class: "bg-neutral-500/80 text-white" },
  archived: { label: "Archived", class: "bg-neutral-400/80 text-white" },
};

export function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold backdrop-blur-sm ${cfg.class}`}
    >
      {cfg.dot && (
        <span className="size-1.5 rounded-full bg-white animate-pulse" />
      )}
      {cfg.label}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────
   CAMPAIGN ACTIONS DROPDOWN
────────────────────────────────────────────────────────── */
export function CampaignActions({
  campaign,
  merchantSlug,
}: {
  campaign: Pick<Campaign, "id" | "slug" | "status">;
  merchantSlug: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (typeof window === "undefined" || !campaign.slug) return;
    const playUrl = `${window.location.origin}/c/${merchantSlug}/${campaign.slug}`;
    navigator.clipboard.writeText(playUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      console.error("Failed to copy text: ", err);
    });
  }

  function act(fn: () => Promise<{ error: string | null }>) {
    setOpen(false);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setErrorMsg(res.error);
    });
  }

  return (
    <div className="relative">
      {errorMsg && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">
          <AlertCircle className="size-3.5 shrink-0" />
          {errorMsg}
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer">×</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Primary: View */}
        <Link
          href={`/m/campaigns/${campaign.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-neutral-900 text-white rounded-lg hover:bg-neutral-700 transition-colors"
        >
          <Eye className="size-3.5" />
          View
        </Link>

        {/* Edit (drafts/paused/scheduled) */}
        {["draft", "paused", "scheduled"].includes(campaign.status) && (
          <Link
            href={`/m/campaigns/${campaign.id}/edit`}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-white border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <Edit3 className="size-3.5" />
            Edit
          </Link>
        )}

        {/* Print QR */}
        {campaign.slug && (
          <Link
            href={`/m/campaigns/print/${merchantSlug}/${campaign.slug}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-white border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors"
          >
            <QrCode className="size-3.5" />
            Print QR
          </Link>
        )}

        {/* Pause / Resume */}
        {campaign.status === "active" && (
          <button
            onClick={() => act(() => updateCampaignStatusAction(campaign.id, "paused"))}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <PauseCircle className="size-3.5" />}
            Pause
          </button>
        )}

        {campaign.status === "paused" && (
          <button
            onClick={() => act(() => updateCampaignStatusAction(campaign.id, "active"))}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
            Resume
          </button>
        )}

        {/* Copy Link */}
        {campaign.slug && (
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 bg-white border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="size-3.5 text-emerald-600" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="size-3.5" />
                Copy Link
              </>
            )}
          </button>
        )}

        {/* More ⋯ dropdown */}
        <div className="relative ml-auto">
          <button
            onClick={() => setOpen(!open)}
            className="inline-flex items-center justify-center size-8 bg-white border border-neutral-200 text-neutral-500 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer"
            aria-label="More options"
          >
            <MoreHorizontal className="size-4" />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute bottom-full right-0 mb-2 z-20 w-44 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden">
                <button
                  onClick={() => act(() => duplicateCampaignAction(campaign.id))}
                  disabled={isPending}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Copy className="size-3.5" />
                  Duplicate
                </button>
                {!["active", "completed"].includes(campaign.status) && (
                  <button
                    onClick={() => act(() => updateCampaignStatusAction(campaign.id, "completed"))}
                    disabled={isPending}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <StopCircle className="size-3.5" />
                    End Campaign
                  </button>
                )}
                <div className="h-px bg-neutral-100 my-1" />
                {["draft", "completed", "archived"].includes(campaign.status) && (
                  <button
                    onClick={() => {
                      if (!confirm("Permanently delete this campaign?")) return;
                      act(() => deleteCampaignAction(campaign.id));
                    }}
                    disabled={isPending}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   EMPTY STATE
────────────────────────────────────────────────────────── */
export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] text-center px-6">
      {/* Illustration */}
      <div className="relative mb-8">
        <div className="size-28 rounded-3xl bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200/60 flex items-center justify-center shadow-xl shadow-emerald-500/10">
          <Megaphone className="size-12 text-emerald-500" strokeWidth={1.5} />
        </div>
        <div className="absolute -top-2 -right-2 size-10 rounded-2xl bg-white border-2 border-emerald-100 flex items-center justify-center shadow-md">
          <span className="text-lg">✨</span>
        </div>
        <div className="absolute -bottom-2 -left-2 size-8 rounded-xl bg-white border-2 border-emerald-100 flex items-center justify-center shadow-md">
          <span className="text-sm">🎁</span>
        </div>
      </div>

      <h2 className="text-xl font-black text-neutral-900 mb-2">No campaigns yet</h2>
      <p className="text-sm text-neutral-500 max-w-xs mb-8 leading-relaxed">
        Create your first Scratch & Win campaign and start engaging customers today. Takes less than 5 minutes.
      </p>

      <Link
        href="/m/campaigns/new"
        className="inline-flex items-center gap-2.5 bg-[#16A34A] hover:bg-[#15803D] text-white font-bold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-green-500/25 text-sm"
      >
        <Plus className="size-4.5" />
        Create your first campaign
      </Link>
    </div>
  );
}
