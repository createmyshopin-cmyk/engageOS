import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { playRequestSchema, normalizeSource } from "@/lib/validation";
import { playCampaign } from "@/lib/db/rpc";
import { clientIpFromHeaders } from "@/lib/ip";
import { syncPlayToWacrm } from "@/lib/wacrm/sync";
import { syncPlayToWati } from "@/lib/wati/sync";
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

  try {
    const result = await playCampaign({
      merchantSlug: parsed.data.merchantSlug,
      campaignSlug: parsed.data.campaignSlug,
      phone: parsed.data.phone,
      name: parsed.data.name,
      ip: clientIpFromHeaders(req.headers),
      source: normalizeSource(parsed.data.source),
    });

    // Sync to integrations AFTER the response is sent — contact upsert + optional
    // coupon delivery must never slow down or break the scratch experience.
    after(() => {
      void syncPlayToWacrm({
        merchantSlug: parsed.data.merchantSlug,
        campaignSlug: parsed.data.campaignSlug,
        phone: parsed.data.phone,
        name: parsed.data.name,
        result,
      });
      void syncPlayToWati({
        merchantSlug: parsed.data.merchantSlug,
        campaignSlug: parsed.data.campaignSlug,
        phone: parsed.data.phone,
        name: parsed.data.name,
        result,
      });
      // Coupon Drop: mint the customer's code in Shopify in real time, against
      // the won tier's parent discount, then link it to the coupon row. Runs off
      // the response path (reveal is already sent). On any failure the customer
      // keeps the internal fallback code play_campaign already issued.
      if (
        result.status === "ok" &&
        result.won &&
        result.campaign_id &&
        result.prize_id &&
        result.coupon_id &&
        result.coupon_code
      ) {
        const mintArgs = {
          campaignId: result.campaign_id,
          prizeId: result.prize_id,
          couponId: result.coupon_id,
          code: result.coupon_code,
          parentGid: result.shopify_parent_discount_id ?? null,
        };
        void (async () => {
          try {
            const { mintCouponForWin } = await import(
              "@/lib/shopify/coupon-drop-orchestrator"
            );
            // Resolve the owning business from the campaign config, server-side.
            const { adminClient } = await import("@/lib/db/rpc");
            const { data } = await adminClient()
              .from("campaign_coupon_configs")
              .select("business_id")
              .eq("campaign_id", mintArgs.campaignId)
              .maybeSingle();
            const businessId = (data as { business_id: string } | null)?.business_id;
            if (!businessId) {
              // Not a coupon_drop campaign (or no config) — nothing to mint.
              return;
            }
            await mintCouponForWin({ businessId, ...mintArgs });
          } catch (err) {
            console.error("coupon real-time mint error:", err);
          }
        })();
      }
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
