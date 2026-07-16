import { NextResponse } from "next/server";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { adminClient } from "@/lib/db/rpc";
import { listBroadcasts } from "@/lib/wacrm/store";

export const runtime = "nodejs";

const WA_EVENTS = [
  "whatsapp.queue",
  "whatsapp.sent",
  "whatsapp.delivered",
  "whatsapp.read",
  "whatsapp.failed",
] as const;

/**
 * WhatsApp analytics — REAL numbers from the immutable campaign_events log
 * (queued/sent/delivered/read/failed), coupon outbox state, quota, and
 * broadcast aggregates. Replaces the old estimated overview card.
 */
export async function GET(): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
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
            .eq("event_type", eventType);
          if (error) throw new Error(`count(${eventType}) failed: ${error.message}`);
          return [eventType, count ?? 0] as const;
        })
      )
    );

    const [couponPending, couponSent, couponFailed, biz, broadcasts] = await Promise.all([
      repo.count("coupons", { wa_status: "pending" }),
      repo.count("coupons", { wa_status: "sent" }),
      repo.count("coupons", { wa_status: "failed" }),
      repo.getBusiness<{ wa_messages_sent: number; wa_messages_quota: number }>(
        "wa_messages_sent, wa_messages_quota"
      ),
      listBroadcasts(repo.businessId, 100),
    ]);

    const broadcastTotals = broadcasts.reduce(
      (acc, b) => ({
        count: acc.count + 1,
        recipients: acc.recipients + b.total_recipients,
        sent: acc.sent + b.sent_count,
        delivered: acc.delivered + b.delivered_count,
        read: acc.read + b.read_count,
        failed: acc.failed + b.failed_count,
      }),
      { count: 0, recipients: 0, sent: 0, delivered: 0, read: 0, failed: 0 }
    );

    return NextResponse.json({
      ok: true,
      events: {
        queued: eventCounts["whatsapp.queue"],
        sent: eventCounts["whatsapp.sent"],
        delivered: eventCounts["whatsapp.delivered"],
        read: eventCounts["whatsapp.read"],
        failed: eventCounts["whatsapp.failed"],
      },
      coupons: { pending: couponPending, sent: couponSent, failed: couponFailed },
      quota: { sent: biz?.wa_messages_sent ?? 0, limit: biz?.wa_messages_quota ?? 0 },
      broadcasts: broadcastTotals,
    });
  } catch (err) {
    console.error("whatsapp analytics error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load analytics" },
      { status: 500 }
    );
  }
}
