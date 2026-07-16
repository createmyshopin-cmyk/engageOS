import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getWacrmForBusiness } from "@/lib/wacrm/adapter";
import { WacrmApiError } from "@/lib/wacrm/client";
import { insertBroadcast, listBroadcasts, updateBroadcastCounts } from "@/lib/wacrm/store";
import { resolveSegmentRecipients, type BroadcastSegment } from "@/lib/wacrm/sync";

export const runtime = "nodejs";

const WACRM_RECIPIENT_CAP = 1000; // per wacrm public-api request

/**
 * Broadcast history. wacrm has no "list broadcasts" endpoint, so EngageOS
 * lists its own launch ledger and refreshes still-sending rows from wacrm.
 */
export async function GET(): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await listBroadcasts(repo.businessId);
    const tenant = await getWacrmForBusiness(repo.businessId);

    if (tenant) {
      // Refresh live counts for anything not yet terminal (bounded fan-out).
      const active = rows.filter((r) => r.status === "sending").slice(0, 10);
      await Promise.all(
        active.map(async (row) => {
          try {
            const { data } = await tenant.client.getBroadcast(row.wacrm_broadcast_id);
            const patch = {
              status: data.status ?? row.status,
              sent_count: data.sent_count ?? row.sent_count,
              delivered_count: data.delivered_count ?? row.delivered_count,
              read_count: data.read_count ?? row.read_count,
              failed_count: data.failed_count ?? row.failed_count,
            };
            Object.assign(row, patch);
            await updateBroadcastCounts(repo.businessId, row.id, patch);
          } catch (err) {
            console.error(`broadcast refresh ${row.wacrm_broadcast_id} failed:`, err);
          }
        })
      );
    }

    return NextResponse.json({ ok: true, broadcasts: rows, connected: !!tenant });
  } catch (err) {
    console.error("broadcast list error:", err);
    return NextResponse.json({ ok: false, error: "Failed to load broadcasts" }, { status: 500 });
  }
}

const launchSchema = z.object({
  name: z.string().trim().min(2, "Give the broadcast a name").max(120),
  templateName: z.string().trim().min(1, "Template name is required").max(120),
  templateLanguage: z.string().trim().min(2).max(15).default("en"),
  segment: z
    .string()
    .trim()
    .regex(/^(all|winners|redeemed|campaign:[0-9a-f-]{36})$/, "Invalid segment"),
  /** Optional positional template params; {{name}} is replaced per recipient. */
  params: z.array(z.string().trim().max(200)).max(10).default([]),
});

/**
 * Launch a template broadcast: segment resolved from EngageOS campaign data
 * (the campaign engine's value-add), delivery fanned out by wacrm.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const repo = await getTenantRepository();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const tenant = await getWacrmForBusiness(repo.businessId);
  if (!tenant) {
    return NextResponse.json({ ok: false, error: "wacrm is not connected" }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  const parsed = launchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // Segment scoped to a campaign must be one the tenant owns.
  if (input.segment.startsWith("campaign:")) {
    const owns = await repo.ownsCampaign(input.segment.slice("campaign:".length));
    if (!owns) {
      return NextResponse.json({ ok: false, error: "Unknown campaign" }, { status: 404 });
    }
  }

  try {
    const recipients = await resolveSegmentRecipients(
      repo.businessId,
      input.segment as BroadcastSegment
    );
    if (recipients.length === 0) {
      return NextResponse.json(
        { ok: false, error: "That segment has no reachable customers" },
        { status: 400 }
      );
    }

    // wacrm caps recipients per request — split large segments into chunks.
    const chunks: (typeof recipients)[] = [];
    for (let i = 0; i < recipients.length; i += WACRM_RECIPIENT_CAP) {
      chunks.push(recipients.slice(i, i + WACRM_RECIPIENT_CAP));
    }

    let totalAccepted = 0;
    let totalRejected = 0;
    const launched: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const { data } = await tenant.client.createBroadcast({
        name: chunks.length > 1 ? `${input.name} (${index + 1}/${chunks.length})` : input.name,
        template_name: input.templateName,
        template_language: input.templateLanguage,
        recipients: chunk.map((r) => ({
          to: r.phone,
          params: input.params.length
            ? input.params.map((p) => p.replaceAll("{{name}}", r.name))
            : undefined,
        })),
      });
      launched.push(data.broadcast_id);
      totalAccepted += data.accepted;
      totalRejected += data.rejected;
      await insertBroadcast({
        business_id: repo.businessId,
        wacrm_broadcast_id: data.broadcast_id,
        name: chunks.length > 1 ? `${input.name} (${index + 1}/${chunks.length})` : input.name,
        template_name: input.templateName,
        template_language: input.templateLanguage,
        segment: input.segment,
        total_recipients: data.total_recipients,
        accepted: data.accepted,
        rejected: data.rejected,
        status: data.status || "sending",
        created_by: repo.session.merchantId,
      });
    }

    await repo.audit("whatsapp.broadcast", "whatsapp_broadcast", launched[0] ?? null, {
      segment: input.segment,
      template: input.templateName,
      recipients: recipients.length,
    });
    await repo.recordEvent("whatsapp.queue", null, {
      kind: "broadcast",
      segment: input.segment,
      template: input.templateName,
      recipients: recipients.length,
      accepted: totalAccepted,
      rejected: totalRejected,
      channel: "wacrm",
    });

    return NextResponse.json({
      ok: true,
      broadcasts: launched,
      recipients: recipients.length,
      accepted: totalAccepted,
      rejected: totalRejected,
    });
  } catch (err) {
    console.error("broadcast launch error:", err);
    const msg =
      err instanceof WacrmApiError
        ? `wacrm rejected the broadcast: ${err.message}`
        : "Failed to launch broadcast";
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
