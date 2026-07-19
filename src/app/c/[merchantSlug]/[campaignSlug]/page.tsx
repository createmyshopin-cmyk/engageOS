import type { Metadata } from "next";
import ReactDOM from "react-dom";
import { headers } from "next/headers";
import { getCampaignDisplay, getCampaignTracking, recordScan } from "@/lib/db/rpc";
import { clientIpFromHeaders } from "@/lib/ip";
import { guardPlayPageView } from "@/lib/play/abuse-guard";
import { normalizeSource } from "@/lib/validation";
import { PlayFlow } from "@/components/play/play-flow";
import { BrandHeader } from "@/components/play/brand-header";
import { PrizePreview } from "@/components/play/prize-preview";
import { PlayAtmosphere } from "@/components/play/play-atmosphere";
import { Preloader } from "@/components/play/preloader";
import { TrackingBootstrap } from "@/lib/tracking/react";
import type { TrackingConfig } from "@/lib/tracking/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ merchantSlug: string; campaignSlug: string }>;
  searchParams: Promise<{ src?: string | string[] }>;
}

const MERCHANT_SLUG_RE = /^[a-z0-9-]{2,40}$/;
const CAMPAIGN_SLUG_RE = /^[a-z0-9-]{2,60}$/;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { merchantSlug, campaignSlug } = await params;
  if (!MERCHANT_SLUG_RE.test(merchantSlug) || !CAMPAIGN_SLUG_RE.test(campaignSlug)) {
    return { title: "Campaign not found" };
  }
  try {
    const display = await getCampaignDisplay(merchantSlug, campaignSlug);
    if (!display) return { title: "Campaign not found" };
    return {
      title: `${display.headline} — ${display.business_name}`,
      description: `Play ${display.name} at ${display.business_name} and win instantly!`,
      openGraph: {
        title: `${display.headline} — ${display.business_name}`,
        description: `Play ${display.name} at ${display.business_name} and win instantly!`,
        images: display.og_image_url || display.banner_url
          ? [{ url: display.og_image_url || display.banner_url!, width: 1200, height: 630 }]
          : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: `${display.headline} — ${display.business_name}`,
        description: `Play ${display.name} at ${display.business_name} and win instantly!`,
        images: display.og_image_url || display.banner_url
          ? [display.og_image_url || display.banner_url!]
          : undefined,
      },
    };
  } catch {
    return { title: "Scratch & Win" };
  }
}

export default async function PlayPage({ params, searchParams }: PageProps) {
  const { merchantSlug, campaignSlug } = await params;
  const { src } = await searchParams;
  const source = normalizeSource(Array.isArray(src) ? src[0] : src);

  let display = null;
  let loadFailed = false;
  let trackingConfigs: TrackingConfig[] = [];
  if (MERCHANT_SLUG_RE.test(merchantSlug) && CAMPAIGN_SLUG_RE.test(campaignSlug)) {
    try {
      [display, trackingConfigs] = await Promise.all([
        getCampaignDisplay(merchantSlug, campaignSlug),
        getCampaignTracking(merchantSlug, campaignSlug),
      ]);
    } catch (err) {
      console.error("play page load error:", err);
      loadFailed = true;
    }
  }

  // Funnel entry: record the QR scan for a live campaign (best-effort,
  // rate-limited + deduped server-side). Never blocks page render. The
  // optional ?src= traffic source is tagged onto the scan event.
  if (display) {
    const ip = clientIpFromHeaders(await headers());
    if (await guardPlayPageView(ip)) {
      await recordScan(merchantSlug, campaignSlug, ip, source);
    }
  }

  if (loadFailed) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-neutral-900">
            Something went wrong
          </p>
          <p className="mt-2 text-sm text-neutral-600">
            Please try scanning the QR code again.
          </p>
        </div>
      </Shell>
    );
  }

  if (!display) {
    return (
      <Shell>
        <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-neutral-900">
            This campaign isn&apos;t available
          </p>
          <p className="mt-2 text-sm text-neutral-600">
            It may have ended or hasn&apos;t started yet. Ask the store for
            their latest offer!
          </p>
        </div>
      </Shell>
    );
  }

  // Warm the LCP images from the document <head> so the browser starts
  // fetching them in parallel with the HTML, before hydration.
  if (display.logo_url) {
    ReactDOM.preload(display.logo_url, { as: "image", fetchPriority: "high" });
  }
  const prizeImages = display.prizes
    .map((p) => p.image_url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  for (const url of prizeImages) {
    ReactDOM.preload(url, { as: "image" });
  }

  return (
    <Shell>
      <TrackingBootstrap
        configs={trackingConfigs}
        context={{
          campaignId: display.campaign_id,
          campaignName: display.name,
          merchantId: merchantSlug,
          merchantName: display.business_name,
          trafficSource: source,
        }}
      >
        <Preloader
          businessName={display.business_name}
          campaignName={display.name}
          logoUrl={display.logo_url}
          preloadImages={prizeImages}
        />

        <BrandHeader
          businessName={display.business_name}
          campaignName={display.name}
          logoUrl={display.logo_url}
          headline={display.headline}
        />

        <PrizePreview prizes={display.prizes} />

        <PlayFlow
          merchantSlug={merchantSlug}
          campaignSlug={campaignSlug}
          display={display}
          source={source}
        />

        <footer className="mt-6 space-y-2 text-center">
          <div className="play-footer-pulse flex items-center justify-center gap-1.5 text-[11px] font-medium text-amber-800/70">
            <span aria-hidden>⬡</span>
            One play per person
          </div>
          <p className="text-[10px] leading-relaxed text-neutral-400">
            By playing you agree to receive offers from {display.business_name} on WhatsApp.
          </p>
          <div className="pt-1 text-[10px] text-neutral-400">
            <span className="text-amber-400">✨</span>
            {" "}Powered by{" "}
            <span className="font-semibold text-orange-500">EngageOS</span>
            {" "}
            <span className="text-amber-400">✨</span>
          </div>
        </footer>
      </TrackingBootstrap>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#FFF9F1] flex flex-col justify-center items-center">
      <PlayAtmosphere />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,107,0,0.08),transparent_55%)]"
      />
      <div className="relative z-10 w-full max-w-md px-4 py-8">{children}</div>
    </main>
  );
}
