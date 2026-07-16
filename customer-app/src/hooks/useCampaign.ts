import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getCampaignDisplay } from "../services/api";
import { networkSnapshot } from "./useNetwork";
import { usePlayStore } from "../store/playStore";

const MERCHANT_RE = /^[a-z0-9-]{2,40}$/;
const CAMPAIGN_RE = /^[a-z0-9-]{2,60}$/;

export function slugsValid(merchant?: string, campaign?: string): boolean {
  return (
    !!merchant &&
    !!campaign &&
    MERCHANT_RE.test(merchant) &&
    CAMPAIGN_RE.test(campaign)
  );
}

export function useCampaign(merchant: string, campaign: string) {
  const setDisplay = usePlayStore((s) => s.setDisplay);
  const query = useQuery({
    queryKey: ["campaign", merchant, campaign],
    queryFn: () => getCampaignDisplay(merchant, campaign),
    enabled: slugsValid(merchant, campaign),
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    if (query.data !== undefined) setDisplay(query.data);
  }, [query.data, setDisplay]);

  useEffect(() => {
    // Progressive preload: logo first (LCP), then scratch/reward art.
    // Skipped in Low Internet Mode — images lazy-load on demand instead.
    const d = query.data;
    if (!d || networkSnapshot().saveData) return;
    if (d.logo_url) {
      const logo = new Image();
      logo.fetchPriority = "high";
      logo.src = d.logo_url;
    }
    const idle =
      "requestIdleCallback" in window
        ? window.requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 300);
    const handle = idle(() => {
      for (const p of d.prizes) {
        if (!p.image_url) continue;
        const img = new Image();
        img.decoding = "async";
        img.src = p.image_url;
      }
    });
    return () => {
      if ("cancelIdleCallback" in window) {
        window.cancelIdleCallback(handle as number);
      } else {
        clearTimeout(handle as ReturnType<typeof setTimeout>);
      }
    };
  }, [query.data]);

  return query;
}
