import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deviceIdSchema } from "@/lib/validation";
import { recordExperienceEvent } from "@/lib/db/rpc";
import { clientIpFromHeaders } from "@/lib/ip";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  campaignId: z.string().uuid(),
  eventType: z.enum([
    "reward.viewed",
    "reward.claimed",
    "scratch.completed",
    "redirect.started",
    "redirect.opened",
    "redirect.completed",
    "redirect.cancelled",
  ]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  deviceId: deviceIdSchema.optional(),
});

/** Per-IP per-campaign event cap — prevents analytics / Zapier spam. */
const EXPERIENCE_RATE_MAX = 60;

export async function POST(req: NextRequest): Promise<NextResponse<{ ok: boolean }>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const ip = clientIpFromHeaders(req.headers);
  const device = parsed.data.deviceId?.trim();
  const rateKey = device
    ? `experience:${ip}:${device}:${parsed.data.campaignId}:${parsed.data.eventType}`
    : `experience:${ip}:${parsed.data.campaignId}:${parsed.data.eventType}`;
  try {
    const allowed = await checkRateLimit(rateKey, EXPERIENCE_RATE_MAX);
    if (!allowed) {
      return NextResponse.json({ ok: false }, { status: 429 });
    }
  } catch (err) {
    console.error("experience rate limit error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Best-effort. business_id is resolved server-side from the campaign inside
  // recordExperienceEvent, so the customer can't attribute to another tenant.
  const ok = await recordExperienceEvent({
    campaignId: parsed.data.campaignId,
    eventType: parsed.data.eventType,
    metadata: parsed.data.metadata ?? {},
    ip,
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok });
}
