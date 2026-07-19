"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2, ArrowLeft } from "lucide-react";
import { commFetch } from "./api";

interface AdvancedLaunchResponse {
  label: string;
  description: string;
  launchUrl: string;
  embedUrl: string;
  expiresIn: number;
}

export function WacrmAdvancedEmbed({ featureId }: { featureId: string }) {
  const [data, setData] = useState<AdvancedLaunchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await commFetch<AdvancedLaunchResponse>(
        `/api/m/communication/advanced/${featureId}`
      );
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load WACRM panel");
    } finally {
      setLoading(false);
    }
  }, [featureId]);

  useEffect(() => {
    const t = setTimeout(() => load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#6B7280]">
        <Loader2 className="size-5 animate-spin" />
        Opening WACRM…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        {error ?? "Could not open this feature."}
        <button
          type="button"
          onClick={load}
          className="mt-3 block text-xs font-bold underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/m/communication/settings"
            className="inline-flex items-center gap-1 text-xs font-bold text-[#6B7280] hover:text-[#111827] mb-2"
          >
            <ArrowLeft className="size-3.5" />
            Back to settings
          </Link>
          <h2 className="text-sm font-black text-[#111827]">{data.label}</h2>
          <p className="text-xs text-[#6B7280] mt-1">{data.description}</p>
        </div>
        <a
          href={data.launchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-bold text-[#111827] hover:border-[#25D366]"
        >
          <ExternalLink className="size-3.5" />
          Open in WACRM
        </a>
      </div>

      <div className="rounded-2xl border border-[#E5E7EB] bg-[#F8FAFC] overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-[#E5E7EB] bg-white px-4 py-2.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7280]">
            Powered by WACRM
          </p>
          <p className="text-[10px] text-[#9CA3AF]">
            Session link expires in {data.expiresIn}s — refresh if needed
          </p>
        </div>
        <iframe
          title={data.label}
          src={data.embedUrl}
          className="w-full bg-white"
          style={{ height: "min(80vh, 900px)" }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          referrerPolicy="no-referrer"
        />
      </div>

      <p className="text-[11px] text-[#6B7280]">
        Advanced CRM features run in your WACRM instance. Meta tokens and template
        approvals never pass through EngageOS.
      </p>
    </div>
  );
}
