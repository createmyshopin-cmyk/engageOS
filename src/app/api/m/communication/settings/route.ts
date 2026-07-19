import { NextResponse } from "next/server";
import { authorizeMerchantRead } from "@/lib/merchant-route-auth";
import { getWacrmIntegration } from "@/lib/wacrm/store";
import { WACRM_ADVANCED_FEATURES } from "@/lib/wacrm/features";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;

  const integration = await getWacrmIntegration(auth.repo.businessId);
  if (!integration || integration.status === "disconnected") {
    return NextResponse.json(
      { ok: false, error: "WACRM is not connected" },
      { status: 409 }
    );
  }

  const baseUrl = integration.base_url.replace(/\/+$/, "");
  const advanced = Object.values(WACRM_ADVANCED_FEATURES).map((f) => ({
    id: f.id,
    label: f.label,
    description: f.description,
    embedPath: `/m/communication/advanced/${f.id}`,
    externalPath: f.path,
  }));

  return NextResponse.json({
    ok: true,
    baseUrl,
    accountName: integration.account_name,
    couponTemplateName: integration.coupon_template_name,
    autoSendCoupons: integration.auto_send_coupons,
    advanced,
    integrationsUrl: "/m/integrations/wacrm",
    ssoConfigured: !!process.env.ENGAGEOS_WACRM_SSO_SECRET,
  });
}
