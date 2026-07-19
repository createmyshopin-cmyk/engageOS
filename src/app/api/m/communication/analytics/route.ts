import { NextResponse } from "next/server";
import { authorizeMerchantRead } from "@/lib/merchant-route-auth";
import { adminClient } from "@/lib/db/rpc";
import { getWacrmIntegration } from "@/lib/wacrm/store";

export const runtime = "nodejs";

const WA_EVENTS = [
  "whatsapp.queue",
  "whatsapp.sent",
  "whatsapp.delivered",
  "whatsapp.read",
  "whatsapp.failed",
] as const;

export async function GET(): Promise<NextResponse> {
  const auth = await authorizeMerchantRead();
  if (!auth.ok) return auth.response;
  const { repo } = auth;

  const integration = await getWacrmIntegration(repo.businessId);
  if (!integration || integration.status === "disconnected") {
    return NextResponse.json(
      { ok: false, error: "WACRM is not connected" },
      { status: 409 }
    );
  }

  try {
    const db = adminClient();

    const eventCounts = Object.fromEntries(
      await Promise.all(
        WA_EVENTS.map(async (eventType) => {
          const { count, error } = await db
            .from("campaign_events")
            .select("id", { count: "exact", head: true })
            .eq("business_id", repo.businessId)
            .eq("event_type", eventType)
            .eq("metadata->>channel", "wacrm");
          if (error) throw new Error(`count(${eventType}) failed: ${error.message}`);
          return [eventType, count ?? 0] as const;
        })
      )
    );

    const { data: broadcasts } = await db
      .from("whatsapp_broadcasts")
      .select("sent_count, delivered_count, read_count, failed_count")
      .eq("business_id", repo.businessId);

    const broadcastTotals = (broadcasts ?? []).reduce(
      (acc, row) => ({
        sent: acc.sent + (row.sent_count ?? 0),
        delivered: acc.delivered + (row.delivered_count ?? 0),
        read: acc.read + (row.read_count ?? 0),
        failed: acc.failed + (row.failed_count ?? 0),
      }),
      { sent: 0, delivered: 0, read: 0, failed: 0 }
    );

    const biz = await repo.getBusiness<{
      wa_messages_sent: number;
      wa_messages_quota: number;
    }>("wa_messages_sent, wa_messages_quota");

    return NextResponse.json({
      ok: true,
      channel: "wacrm",
      funnel: eventCounts,
      broadcasts: broadcastTotals,
      quota: { sent: biz?.wa_messages_sent ?? 0, limit: biz?.wa_messages_quota ?? 0 },
    });
  } catch (err) {
    console.error("communication analytics error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load reports" },
      { status: 500 }
    );
  }
}
