import { NextResponse } from "next/server";
import { authorizeMerchantRead } from "@/lib/merchant-route-auth";
import { getWacrmIntegration } from "@/lib/wacrm/store";
import { buildWacrmLaunchUrl, mintWacrmSsoToken } from "@/lib/wacrm/deeplink";
import {
  isWacrmAdvancedFeature,
  WACRM_ADVANCED_FEATURES,
} from "@/lib/wacrm/features";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ feature: string }> }
): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;

  const { feature: featureId } = await ctx.params;
  if (!isWacrmAdvancedFeature(featureId)) {
    return NextResponse.json({ ok: false, error: "Unknown feature" }, { status: 404 });
  }

  const integration = await getWacrmIntegration(auth.repo.businessId);
  if (!integration || integration.status === "disconnected") {
    return NextResponse.json(
      { ok: false, error: "WACRM is not connected" },
      { status: 409 }
    );
  }

  const feature = WACRM_ADVANCED_FEATURES[featureId];
  const baseUrl = integration.base_url.replace(/\/+$/, "");

  try {
    const { token, expiresIn } = mintWacrmSsoToken({
      accountId: integration.account_id,
      businessId: auth.repo.businessId,
      merchantId: auth.session.merchantId,
      path: feature.path,
      embed: false,
    });

    const embedMint = mintWacrmSsoToken({
      accountId: integration.account_id,
      businessId: auth.repo.businessId,
      merchantId: auth.session.merchantId,
      path: feature.path,
      embed: true,
    });

    return NextResponse.json({
      ok: true,
      feature: featureId,
      label: feature.label,
      description: feature.description,
      expiresIn,
      launchUrl: buildWacrmLaunchUrl(baseUrl, token),
      embedUrl: buildWacrmLaunchUrl(baseUrl, embedMint.token, { embed: true }),
      embedPath: `/m/communication/advanced/${featureId}`,
    });
  } catch (err) {
    console.error("wacrm advanced deeplink error:", err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error && err.message.includes("ENGAGEOS_WACRM_SSO_SECRET")
            ? "SSO is not configured on the server"
            : "Failed to create WACRM session link",
      },
      { status: 500 }
    );
  }
}
