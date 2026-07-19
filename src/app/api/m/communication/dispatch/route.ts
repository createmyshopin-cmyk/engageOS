import { NextRequest, NextResponse } from "next/server";
import { authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { dispatchPendingCoupons } from "@/lib/communication/gateway";

export const runtime = "nodejs";

/** Drain pending coupon WhatsApp outbox for the active provider. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  let campaignId: string | undefined;
  try {
    const body = await req.json();
    if (body && typeof body.campaignId === "string") {
      if (!(await repo.ownsCampaign(body.campaignId))) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
      }
      campaignId = body.campaignId;
    }
  } catch {
    /* no body is fine */
  }

  try {
    const result = await dispatchPendingCoupons(repo.businessId, 50, campaignId);
    if (result.error && result.sent === 0 && result.failed === 0) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("communication dispatch error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to dispatch pending messages" },
      { status: 500 }
    );
  }
}
