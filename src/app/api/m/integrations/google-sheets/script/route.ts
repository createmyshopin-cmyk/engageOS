import { NextResponse } from "next/server";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { getGoogleSheetsIntegration } from "@/lib/google-sheets/store";
import { listEnabledFeeds } from "@/lib/google-sheets/feeds-store";
import { generateAppsScript } from "@/lib/google-sheets/script-generator";

export const runtime = "nodejs";

/** Return auto-generated Apps Script for the current feed configuration. */
export async function GET(): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  const integration = await getGoogleSheetsIntegration(repo.businessId);
  if (!integration || integration.status !== "connected") {
    return NextResponse.json(
      { ok: false, error: "Connect Google Sheets before generating script" },
      { status: 400 }
    );
  }

  try {
    const feeds = await listEnabledFeeds(repo.businessId);
    const script = generateAppsScript(feeds, integration.webapp_url);
    return NextResponse.json({ ok: true, script, feedCount: feeds.length });
  } catch (err) {
    console.error("google-sheets script error:", err);
    return NextResponse.json({ ok: false, error: "Failed to generate script" }, { status: 500 });
  }
}
