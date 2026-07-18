import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { playRequestSchema, normalizeSource } from "@/lib/validation";
import { playCampaign } from "@/lib/db/rpc";
import { clientIpFromHeaders } from "@/lib/ip";
import { syncPlayToWacrm } from "@/lib/wacrm/sync";
import { syncPlayToWati } from "@/lib/wati/sync";
import type { PlayResult } from "@/lib/types";

export const runtime = "nodejs";

type ApiResponse =
  | { ok: true; result: PlayResult }
  | { ok: false; error: string; fields?: Record<string, string> };

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }

  const parsed = playRequestSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json(
      { ok: false, error: "Please check your details", fields },
      { status: 400 }
    );
  }

  try {
    const result = await playCampaign({
      merchantSlug: parsed.data.merchantSlug,
      campaignSlug: parsed.data.campaignSlug,
      phone: parsed.data.phone,
      name: parsed.data.name,
      ip: clientIpFromHeaders(req.headers),
      source: normalizeSource(parsed.data.source),
    });

    // Sync to integrations AFTER the response is sent — contact upsert + optional
    // coupon delivery must never slow down or break the scratch experience.
    after(() => {
      void syncPlayToWacrm({
        merchantSlug: parsed.data.merchantSlug,
        campaignSlug: parsed.data.campaignSlug,
        phone: parsed.data.phone,
        name: parsed.data.name,
        result,
      });
      void syncPlayToWati({
        merchantSlug: parsed.data.merchantSlug,
        campaignSlug: parsed.data.campaignSlug,
        phone: parsed.data.phone,
        name: parsed.data.name,
        result,
      });
      // Coupon Drop: self-heal the code pool if this win drew it low. Keyed only
      // by campaign_id (business resolved server-side); no-op for other types.
      if (result.status === "ok" && result.won && result.campaign_id) {
        const campaignId = result.campaign_id;
        void (async () => {
          try {
            const { topUpPoolForCampaign } = await import(
              "@/lib/shopify/coupon-drop-orchestrator"
            );
            await topUpPoolForCampaign(campaignId);
          } catch (err) {
            console.error("coupon pool top-up error:", err);
          }
        })();
      }
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("play API error:", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
