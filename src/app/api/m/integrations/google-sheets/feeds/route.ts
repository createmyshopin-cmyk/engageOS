import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authorizeMerchantRead, authorizeMerchantWrite } from "@/lib/merchant-route-auth";
import { getGoogleSheetsIntegration } from "@/lib/google-sheets/store";
import { listEnabledFeeds, replaceFeeds } from "@/lib/google-sheets/feeds-store";
import type { GoogleSheetsFeedInput } from "@/lib/google-sheets/types";
import { replaceFeedsBody } from "@/server/modules/google-sheets/validator";

export const runtime = "nodejs";

/** Save export feed configuration. */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await authorizeMerchantWrite();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  const integration = await getGoogleSheetsIntegration(repo.businessId);
  if (!integration || integration.status !== "connected") {
    return NextResponse.json(
      { ok: false, error: "Connect Google Sheets before configuring exports" },
      { status: 400 }
    );
  }

  let body: z.infer<typeof replaceFeedsBody>;
  try {
    body = replaceFeedsBody.parse(await req.json());
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message : "Invalid request";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  try {
    const inputs: GoogleSheetsFeedInput[] = body.feeds.map((f) => ({
      feedType: f.feedType,
      tabName: f.tabName,
      campaignId: f.campaignId ?? null,
      tagId: f.tagId ?? null,
      config: f.config ?? {},
      enabled: f.enabled ?? true,
    }));
    const feeds = await replaceFeeds(repo.businessId, inputs);
    return NextResponse.json({ ok: true, feeds });
  } catch (err) {
    console.error("google-sheets feeds save error:", err);
    return NextResponse.json({ ok: false, error: "Failed to save export config" }, { status: 500 });
  }
}
