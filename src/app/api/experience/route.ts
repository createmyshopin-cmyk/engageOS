import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recordExperienceEvent } from "@/lib/db/rpc";
import { clientIpFromHeaders } from "@/lib/ip";

export const runtime = "nodejs";

const bodySchema = z.object({
  campaignId: z.string().uuid(),
  eventType: z.enum([
    "reward.viewed",
    "reward.claimed",
    "redirect.started",
    "redirect.opened",
    "redirect.completed",
    "redirect.cancelled",
  ]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

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

  // Best-effort. business_id is resolved server-side from the campaign inside
  // recordExperienceEvent, so the customer can't attribute to another tenant.
  const ok = await recordExperienceEvent({
    campaignId: parsed.data.campaignId,
    eventType: parsed.data.eventType,
    metadata: parsed.data.metadata ?? {},
    ip: clientIpFromHeaders(req.headers),
    userAgent: req.headers.get("user-agent"),
  });

  return NextResponse.json({ ok });
}
