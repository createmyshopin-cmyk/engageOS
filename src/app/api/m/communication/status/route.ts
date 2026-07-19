import { NextResponse } from "next/server";
import { authorizeMerchantRead } from "@/lib/merchant-route-auth";
import { getWacrmIntegration } from "@/lib/wacrm/store";
import { getWacrmForBusiness } from "@/lib/wacrm/adapter";
import { adminClient } from "@/lib/db/rpc";
import { getActiveWhatsAppProvider } from "@/lib/communication/provider";

export const runtime = "nodejs";

/** Communication module health + quota snapshot. */
export async function GET(): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  try {
    const provider = await getActiveWhatsAppProvider(repo.businessId);
    const biz = await repo.getBusiness<{
      wa_messages_sent: number;
      wa_messages_quota: number;
    }>("wa_messages_sent, wa_messages_quota");

    let pendingCoupons = 0;
    const { count } = await adminClient()
      .from("coupons")
      .select("id", { count: "exact", head: true })
      .eq("business_id", repo.businessId)
      .eq("wa_status", "pending");
    pendingCoupons = count ?? 0;

    if (provider === "wacrm") {
      const integration = await getWacrmIntegration(repo.businessId);
      let wacrmHealthy = false;
      if (integration) {
        const tenant = await getWacrmForBusiness(repo.businessId);
        if (tenant) {
          try {
            await tenant.client.me();
            wacrmHealthy = true;
          } catch {
            wacrmHealthy = false;
          }
        }
      }

      return NextResponse.json({
        ok: true,
        provider: "wacrm",
        connected: !!integration && integration.status !== "disconnected",
        healthy: wacrmHealthy,
        accountName: integration?.account_name ?? null,
        lastError: integration?.last_error ?? null,
        quota: {
          sent: biz?.wa_messages_sent ?? 0,
          limit: biz?.wa_messages_quota ?? 0,
        },
        pendingCoupons,
      });
    }

    return NextResponse.json({
      ok: true,
      provider,
      connected: provider !== null,
      healthy: provider !== null,
      quota: {
        sent: biz?.wa_messages_sent ?? 0,
        limit: biz?.wa_messages_quota ?? 0,
      },
      pendingCoupons,
    });
  } catch (err) {
    console.error("communication status error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load communication status" },
      { status: 500 }
    );
  }
}
