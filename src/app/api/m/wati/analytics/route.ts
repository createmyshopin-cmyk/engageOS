import { NextResponse } from "next/server";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { adminClient } from "@/lib/db/rpc";
import { getWatiForBusiness } from "@/lib/wati/adapter";

export const runtime = "nodejs";

const WA_EVENTS = [
  "whatsapp.queue",
  "whatsapp.sent",
  "whatsapp.delivered",
  "whatsapp.read",
  "whatsapp.failed",
] as const;

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/**
 * WATI analytics — REAL numbers from the immutable campaign_events log,
 * scoped to metadata.channel = "wati" so wacrm sends are not double-counted.
 * Supplemented (best-effort) by WATI's own account-wide broadcast overview,
 * which is null when the account/plan doesn't expose it.
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
            .eq("event_type", eventType)
            .eq("metadata->>channel", "wati");
          if (error) throw new Error(`count(${eventType}) failed: ${error.message}`);
          return [eventType, count ?? 0] as const;
        })
      )
    );

    const biz = await repo.getBusiness<{
      wa_messages_sent: number;
      wa_messages_quota: number;
    }>("wa_messages_sent, wa_messages_quota");

    // Best-effort account-wide overview from WATI itself.
    let overview: {
      total: number;
      sent: number;
      delivered: number;
      read: number;
      failed: number;
    } | null = null;
    try {
      const tenant = await getWatiForBusiness(repo.businessId);
      if (tenant) {
        const raw = await tenant.client.getBroadcastOverview();
        if (raw) {
          overview = {
            total: num(raw.total),
            sent: num(raw.sent),
            delivered: num(raw.delivered),
            read: num(raw.read),
            failed: num(raw.failed),
          };
        }
      }
    } catch {
      /* non-fatal — our own funnel is the source of truth */
    }

    return NextResponse.json({
      ok: true,
      events: {
        queued: eventCounts["whatsapp.queue"],
        sent: eventCounts["whatsapp.sent"],
        delivered: eventCounts["whatsapp.delivered"],
        read: eventCounts["whatsapp.read"],
        failed: eventCounts["whatsapp.failed"],
      },
      quota: { sent: biz?.wa_messages_sent ?? 0, limit: biz?.wa_messages_quota ?? 0 },
      overview,
    });
  } catch (err) {
    console.error("wati analytics error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to load WATI analytics" },
      { status: 500 }
    );
  }
}
