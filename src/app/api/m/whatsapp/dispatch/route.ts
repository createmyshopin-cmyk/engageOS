import { NextResponse } from "next/server";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { dispatchPendingCoupons } from "@/lib/wacrm/sync";

export const runtime = "nodejs";

/**
 * Drain the pending-coupon outbox through wacrm (merchant-triggered).
 * Pairs with the existing "Retry failed" action, which requeues
 * failed → pending; this is what actually sends them.
 */
export async function POST(): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await dispatchPendingCoupons(repo.businessId, 50);
    if (result.error && result.sent === 0 && result.failed === 0) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    }
    await repo.audit("whatsapp.dispatch", "coupons", null, {
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("whatsapp dispatch error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to send pending coupons" },
      { status: 500 }
    );
  }
}
