import { NextResponse } from "next/server";
import { authorizeMerchantRead } from "@/lib/merchant-route-auth";
import { adminClient } from "@/lib/db/rpc";
import { requireWacrmTenant, wacrmErrorResponse } from "@/lib/communication/wacrm-proxy";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  const wacrm = await requireWacrmTenant(auth.repo.businessId);
  if (!wacrm.ok) return wacrm.response;

  try {
    const live = await wacrm.tenant.client.getBroadcast(id);

    await adminClient()
      .from("whatsapp_broadcasts")
      .update({
        status: live.status,
        sent_count: live.sent_count,
        delivered_count: live.delivered_count,
        read_count: live.read_count,
        failed_count: live.failed_count,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", auth.repo.businessId)
      .eq("wacrm_broadcast_id", id);

    return NextResponse.json({ ok: true, broadcast: live });
  } catch (err) {
    return wacrmErrorResponse(err);
  }
}
