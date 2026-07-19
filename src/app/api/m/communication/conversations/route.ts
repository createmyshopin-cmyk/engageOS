import { NextRequest, NextResponse } from "next/server";
import { authorizeMerchantRead } from "@/lib/merchant-route-auth";
import { requireWacrmTenant, wacrmErrorResponse } from "@/lib/communication/wacrm-proxy";

export const runtime = "nodejs";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;

  const wacrm = await requireWacrmTenant(auth.repo.businessId);
  if (!wacrm.ok) return wacrm.response;

  const { searchParams } = req.nextUrl;
  try {
    const result = await wacrm.tenant.client.listConversations({
      limit: Number(searchParams.get("limit") ?? 50),
      cursor: searchParams.get("cursor") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return wacrmErrorResponse(err);
  }
}
