"use client";

import { Megaphone } from "lucide-react";
import type { CampaignListItemDTO } from "@/lib/api/types";
import type { WinnerCampaignScope } from "@/lib/api/types";

export const DEFAULT_CAMPAIGN_FILTER = "scope:eligible";

export function campaignFilterToApi(value: string): {
  campaignId: string | null;
  campaignScope: WinnerCampaignScope;
} {
  if (value.startsWith("campaign:")) {
    return { campaignId: value.slice("campaign:".length), campaignScope: "eligible" };
  }
  if (value === "scope:active") return { campaignId: null, campaignScope: "active" };
  if (value === "scope:ended") return { campaignId: null, campaignScope: "ended" };
  return { campaignId: null, campaignScope: "eligible" };
}

export function campaignFilterLabel(
  value: string,
  activeCampaigns: CampaignListItemDTO[],
  endedCampaigns: CampaignListItemDTO[]
): string {
  if (value === "scope:eligible") return "All active & ended";
  if (value === "scope:active") return "All active campaigns";
  if (value === "scope:ended") return "All ended campaigns";
  if (value.startsWith("campaign:")) {
    const id = value.slice("campaign:".length);
    const match =
      activeCampaigns.find((c) => c.id === id) ?? endedCampaigns.find((c) => c.id === id);
    return match?.name ?? "Campaign";
  }
  return "Campaign";
}

interface WinnersCampaignFilterProps {
  value: string;
  onChange: (value: string) => void;
  activeCampaigns: CampaignListItemDTO[];
  endedCampaigns: CampaignListItemDTO[];
  loading?: boolean;
}

export function WinnersCampaignFilter({
  value,
  onChange,
  activeCampaigns,
  endedCampaigns,
  loading,
}: WinnersCampaignFilterProps) {
  return (
    <div className="relative shrink-0">
      <Megaphone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-400 pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        aria-label="Filter by campaign"
        className="appearance-none pl-9 pr-8 py-3 min-w-[11rem] max-w-[14rem] text-sm font-bold bg-neutral-50 border border-neutral-200/80 rounded-xl text-neutral-700 hover:bg-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 disabled:opacity-60 truncate"
      >
        <option value="scope:eligible">All active & ended</option>
        <option value="scope:active">Active campaigns only</option>
        <option value="scope:ended">Ended campaigns only</option>
        {activeCampaigns.length > 0 && (
          <optgroup label="Active campaigns">
            {activeCampaigns.map((c) => (
              <option key={c.id} value={`campaign:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
        {endedCampaigns.length > 0 && (
          <optgroup label="Ended campaigns">
            {endedCampaigns.map((c) => (
              <option key={c.id} value={`campaign:${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 text-xs">
        ▾
      </span>
    </div>
  );
}
