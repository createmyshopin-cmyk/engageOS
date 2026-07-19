import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { redeemRequestSchema } from "@/lib/validation";
import { redeemCoupon } from "@/lib/db/rpc";
import { getStaffSession } from "@/lib/staff-session";
import { clientIpFromHeaders } from "@/lib/ip";
import { checkRateLimit } from "@/lib/rate-limit";
import type { RedeemResult } from "@/lib/types";

export const runtime = "nodejs";

type ApiResponse =
  | { ok: true; result: RedeemResult }
  | { ok: false; error: string };

/** Brute-force guard after staff session is established. */
const REDEEM_RATE_MAX = 30;

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  const session = await getStaffSession();
  if (!session) {
    return NextResponse.json(
      { ok: false, error: "Session expired. Please log in again." },
      { status: 401 }
    );
  }

  const ip = clientIpFromHeaders(req.headers);
  try {
    const allowed = await checkRateLimit(
      `redeem:${session.businessId}:${ip}`,
      REDEEM_RATE_MAX
    );
    if (!allowed) {
      return NextResponse.json(
        { ok: false, error: "Too many attempts. Slow down and try again." },
        { status: 429 }
      );
    }
  } catch (err) {
    console.error("redeem rate limit error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const parsed = redeemRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Enter a code like ONAM-AB12" },
      { status: 400 }
    );
  }

  try {
    const result = await redeemCoupon({
      businessId: session.businessId,
      code: parsed.data.code,
    });

    if (result.status === "redeemed") {
      after(async () => {
        const { adminClient } = await import("@/lib/db/rpc");
        const { enqueueCommunicationJob } = await import("@/lib/communication/outbox");
        const { CommunicationEvents } = await import("@/lib/communication/events");
        const { syncRedeem } = await import("@/lib/communication/gateway");

        const { data: coupon } = await adminClient()
          .from("coupons")
          .select("id, code, prize_name, campaign_id, customer_id, customers!inner(phone, name)")
          .eq("business_id", session.businessId)
          .eq("code", parsed.data.code.trim().toUpperCase())
          .maybeSingle<{
            id: string;
            code: string;
            prize_name: string;
            campaign_id: string;
            customer_id: string;
            customers: { phone: string; name: string } | { phone: string; name: string }[];
          }>();

        const customer = coupon
          ? Array.isArray(coupon.customers)
            ? coupon.customers[0]
            : coupon.customers
          : null;

        if (coupon && customer) {
          await syncRedeem({
            businessId: session.businessId,
            phone: customer.phone,
            campaignId: coupon.campaign_id,
          });

          await enqueueCommunicationJob({
            businessId: session.businessId,
            eventType: CommunicationEvents.COUPON_REDEEMED,
            dedupKey: `coupon.redeemed:${coupon.id}`,
            payload: {
              customerId: coupon.customer_id,
              phone: customer.phone,
              customerName: customer.name,
              campaignId: coupon.campaign_id,
              couponCode: coupon.code,
              prizeName: coupon.prize_name,
            },
          });
        }
      });
    }

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("redeem API error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
