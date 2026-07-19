import "server-only";
import { checkRateLimit } from "@/lib/rate-limit";

/** Hourly caps applied before play_campaign RPC (defence in depth). */
const LIMITS = {
  ipGlobal: 20,
  ipGlobalNoDevice: 12,
  ipPerCampaign: 8,
  deviceGlobal: 6,
  devicePerCampaign: 3,
  playPagePerIp: 120,
} as const;

export type PlayGuardResult = "ok" | "rate_limited";

/**
 * App-layer play abuse guard — IP + optional device limits.
 * DB play_campaign applies its own limits as a second line of defence.
 */
export async function guardPlayRequest(opts: {
  ip: string;
  merchantSlug: string;
  campaignSlug: string;
  deviceId?: string | null;
}): Promise<PlayGuardResult> {
  const camp = `${opts.merchantSlug}:${opts.campaignSlug}`;
  const device = opts.deviceId?.trim() || null;

  const ipCap = device ? LIMITS.ipGlobal : LIMITS.ipGlobalNoDevice;
  if (!(await checkRateLimit(`play:ip:${opts.ip}`, ipCap))) {
    return "rate_limited";
  }
  if (!(await checkRateLimit(`play:ipcamp:${opts.ip}:${camp}`, LIMITS.ipPerCampaign))) {
    return "rate_limited";
  }

  if (device) {
    if (!(await checkRateLimit(`play:dev:${device}`, LIMITS.deviceGlobal))) {
      return "rate_limited";
    }
    if (!(await checkRateLimit(`play:devcamp:${device}:${camp}`, LIMITS.devicePerCampaign))) {
      return "rate_limited";
    }
  }

  return "ok";
}

/** Throttle QR page loads / scan logging per IP (page still renders). */
export async function guardPlayPageView(ip: string): Promise<boolean> {
  return checkRateLimit(`playpage:ip:${ip}`, LIMITS.playPagePerIp);
}
