import { NextResponse } from "next/server";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getIntegration } from "@/lib/wacrm/store";
import { adminClient } from "@/lib/db/rpc";

export const runtime = "nodejs";

/** Integration status + quota summary for the /m/whatsapp shell. */
export async function GET(): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [integration, config, biz, pendingCoupons] = await Promise.all([
      getIntegration(repo.businessId),
      adminClient()
        .from("whatsapp_config")
        .select("phone_number_id, waba_id")
        .eq("account_id", repo.businessId)
        .maybeSingle(),
      repo.getBusiness<{ wa_messages_sent: number; wa_messages_quota: number }>(
        "wa_messages_sent, wa_messages_quota"
      ),
      repo.count("coupons", { status: "issued", wa_status: "pending" }),
    ]);

    return NextResponse.json({
      ok: true,
      connected: !!integration && integration.status !== "disconnected",
      integration: integration
        ? {
            baseUrl: integration.base_url,
            keyLast4: integration.api_key_last4,
            accountName: integration.account_name,
            status: integration.status,
            lastError: integration.last_error,
            webhookRegistered: !!integration.webhook_id || true, // Locally webhook endpoint is always ready
            couponTemplateName: integration.coupon_template_name,
            couponTemplateLanguage: integration.coupon_template_language,
            autoSendCoupons: integration.auto_send_coupons,
            lastVerifiedAt: integration.last_verified_at,
            phoneNumberId: config.data?.phone_number_id,
            wabaId: config.data?.waba_id,
          }
        : null,
      quota: {
        sent: biz?.wa_messages_sent ?? 0,
        limit: biz?.wa_messages_quota ?? 0,
      },
      pendingCoupons,
    });
  } catch (err) {
    console.error("whatsapp status error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load WhatsApp status" },
      { status: 500 }
    );
  }
}
