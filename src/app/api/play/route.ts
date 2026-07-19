import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { playRequestSchema, normalizeSource } from "@/lib/validation";
import { playCampaign } from "@/lib/db/rpc";
import { clientIpFromHeaders } from "@/lib/ip";
import { guardPlayRequest } from "@/lib/play/abuse-guard";
import { syncPlayResult } from "@/lib/whatsapp/gateway";
import { setWhatsAppConsentByPhone } from "@/lib/whatsapp/consent";
import { finalizeCouponDropPlay } from "@/lib/shopify/coupon-drop-orchestrator";
import type { PlayResult } from "@/lib/types";

export const runtime = "nodejs";

type ApiResponse =
  | { ok: true; result: PlayResult }
  | { ok: false; error: string; fields?: Record<string, string> };

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }

  const parsed = playRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json(
      { ok: false, error: "Please check your details", fields },
      { status: 400 }
    );
  }

  const ip = clientIpFromHeaders(req.headers);

  try {
    const guard = await guardPlayRequest({
      ip,
      merchantSlug: parsed.data.merchantSlug,
      campaignSlug: parsed.data.campaignSlug,
      deviceId: parsed.data.deviceId,
    });
    if (guard === "rate_limited") {
      return NextResponse.json(
        { ok: true, result: { status: "rate_limited" } },
        { status: 200 }
      );
    }

    let result = await playCampaign({
      merchantSlug: parsed.data.merchantSlug,
      campaignSlug: parsed.data.campaignSlug,
      phone: parsed.data.phone,
      name: parsed.data.name,
      ip,
      source: normalizeSource(parsed.data.source),
      deviceId: parsed.data.deviceId,
    });

    if (
      result.status === "ok" &&
      result.won &&
      result.campaign_id &&
      result.coupon_id
    ) {
      result = await finalizeCouponDropPlay(result);
    }

    after(async () => {
      const { adminClient } = await import("@/lib/db/rpc");
      const { data: business } = await adminClient()
        .from("businesses")
        .select("id")
        .eq("slug", parsed.data.merchantSlug)
        .maybeSingle<{ id: string }>();
      if (!business) return;

      if (result.status === "ok") {
        await setWhatsAppConsentByPhone({
          businessId: business.id,
          phone: parsed.data.phone,
          granted: true,
          source: `campaign_registration:${parsed.data.campaignSlug}`,
          campaignSlug: parsed.data.campaignSlug,
          disclosureText:
            "I agree to receive this reward and future offers on WhatsApp. I can reply STOP at any time.",
          evidence: {
            source: normalizeSource(parsed.data.source),
            deviceId: parsed.data.deviceId,
          },
        });
      }

      await syncPlayResult({
        merchantSlug: parsed.data.merchantSlug,
        campaignSlug: parsed.data.campaignSlug,
        phone: parsed.data.phone,
        name: parsed.data.name,
        result,
      });
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("play API error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
