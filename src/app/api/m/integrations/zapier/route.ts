import { NextResponse } from "next/server";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import {
  connectZapier,
  disconnectZapier,
  getZapierIntegrationPublic,
  listActiveHooks,
} from "@/lib/zapier/store";
import { ZAPIER_EVENTS, ZAPIER_EVENT_DESCRIPTIONS } from "@/lib/zapier/events";

export const runtime = "nodejs";

/** Current Zapier integration status for this tenant. */
export async function GET(): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  try {
    const integration = await getZapierIntegrationPublic(repo.businessId);
    const hooks = integration.status === "connected" ? await listActiveHooks(repo.businessId) : [];
    const triggers = ZAPIER_EVENTS.map((event) => ({
      event,
      description: ZAPIER_EVENT_DESCRIPTIONS[event],
    }));

    return NextResponse.json({
      ok: true,
      connected: integration.status === "connected",
      integration,
      hooks,
      triggers,
    });
  } catch (err) {
    console.error("zapier status error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load Zapier status" },
      { status: 500 }
    );
  }
}

/** Generate or regenerate the Zapier API key. */
export async function POST(): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  try {
    const { apiKey, integration } = await connectZapier(repo.businessId);
    return NextResponse.json({
      ok: true,
      apiKey,
      integration,
      message:
        "Zapier connected. Copy your API key now — it won't be shown again.",
    });
  } catch (err) {
    console.error("zapier connect error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to connect Zapier integration" },
      { status: 500 }
    );
  }
}

/** Disconnect Zapier (revoke keys and deactivate hooks). */
export async function DELETE(): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  try {
    await disconnectZapier(repo.businessId);
    return NextResponse.json({ ok: true, connected: false });
  } catch (err) {
    console.error("zapier disconnect error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to disconnect Zapier integration" },
      { status: 500 }
    );
  }
}
