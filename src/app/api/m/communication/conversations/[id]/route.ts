import { NextResponse } from "next/server";
import { authorizeMerchantRead } from "@/lib/merchant-route-auth";
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
    const conversation = await wacrm.tenant.client.getConversation(id);
    return NextResponse.json({ ok: true, conversation });
  } catch (err) {
    return wacrmErrorResponse(err);
  }
}
