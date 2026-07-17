"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  Eye,
  Edit,
  Copy,
  Printer,
  Pause,
  Play,
  Trash,
  MoreHorizontal,
  Loader2,
  AlertCircle,
  Check,
} from "lucide-react";
import {
  updateCampaignStatusAction,
  duplicateCampaignAction,
  deleteCampaignAction,
} from "@/app/m/campaigns/actions";
import type { Campaign } from "@/lib/types";

interface DashboardActionsProps {
  campaign: Pick<Campaign, "id" | "slug" | "status">;
  merchantSlug: string;
}

export function DashboardActions({ campaign, merchantSlug }: DashboardActionsProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (typeof window === "undefined" || !campaign.slug) return;
    const playUrl = `${window.location.origin}/c/${merchantSlug}/${campaign.slug}`;
    navigator.clipboard.writeText(playUrl).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setOpen(false);
      }, 1500);
    }).catch(err => {
      console.error("Failed to copy text: ", err);
    });
  }

  function act(fn: () => Promise<{ error: string | null }>) {
    setOpen(false);
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        setErrorMsg(res.error);
      }
    });
  }

  return (
    <div className="w-full relative">
      {errorMsg && (
        <div className="absolute bottom-full left-0 right-0 mb-2 flex items-center gap-1.5 text-[10px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-2.5 py-1.5 z-30">
          <AlertCircle className="size-3 shrink-0" />
          <span className="truncate">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-600 cursor-pointer">×</button>
        </div>
      )}

      <div className="flex items-center gap-1.5 w-full">
        {/* View */}
        <Link
          href={`/m/campaigns/${campaign.id}`}
          className="flex-1 inline-flex items-center justify-center gap-1 bg-neutral-900 hover:bg-neutral-800 text-white text-[11px] font-bold py-2 rounded-xl transition-all shadow-sm"
        >
          <Eye className="size-3.5" />
          View
        </Link>

        {/* Print QR */}
        {campaign.slug && (
          <Link
            href={`/m/campaigns/print/${merchantSlug}/${campaign.slug}`}
            target="_blank"
            className="flex-1 inline-flex items-center justify-center gap-1 bg-white hover:bg-neutral-50 text-neutral-700 border border-neutral-200 text-[11px] font-bold py-2 rounded-xl transition-all shadow-sm"
          >
            <Printer className="size-3.5" />
            Print
          </Link>
        )}

        {/* Pause / Resume */}
        {campaign.status === "active" && (
          <button
            onClick={() => act(() => updateCampaignStatusAction(campaign.id, "paused"))}
            disabled={isPending}
            className="flex-1 inline-flex items-center justify-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[11px] font-bold py-2 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <>
                <Pause className="size-3.5" />
                Pause
              </>
            )}
          </button>
        )}

        {campaign.status === "paused" && (
          <button
            onClick={() => act(() => updateCampaignStatusAction(campaign.id, "active"))}
            disabled={isPending}
            className="flex-1 inline-flex items-center justify-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold py-2 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <>
                <Play className="size-3.5" />
                Resume
              </>
            )}
          </button>
        )}

        {/* More Options Dropdown */}
        <div className="relative shrink-0">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center justify-center size-8 bg-white hover:bg-neutral-50 text-neutral-500 border border-neutral-200 rounded-xl transition-all cursor-pointer"
            aria-label="More options"
          >
            <MoreHorizontal className="size-4" />
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
              <div className="absolute bottom-full right-0 mb-2 z-20 w-40 bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-150">
                <Link
                  href={`/m/campaigns/${campaign.id}/edit`}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors"
                >
                  <Edit className="size-3.5" />
                  Edit
                </Link>
                <button
                  onClick={() => act(() => duplicateCampaignAction(campaign.id))}
                  disabled={isPending}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Copy className="size-3.5" />
                  Duplicate
                </button>
                {campaign.slug && (
                  <button
                    onClick={handleCopy}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer"
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
                <button
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this campaign?")) {
                      act(() => deleteCampaignAction(campaign.id));
                    }
                  }}
                  disabled={isPending}
                  className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50/50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Trash className="size-3.5" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
