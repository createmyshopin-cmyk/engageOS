import "server-only";

import { adminClient } from "@/lib/db/rpc";
import type { TenantRepository } from "@/lib/db/tenant-repository";
import { AnalyticsRepository } from "@/server/modules/analytics/repository";
import { toAnalyticsOverviewDTO } from "@/server/modules/analytics/dto";
import { getWacrmIntegration } from "@/lib/wacrm/store";
import { requireWacrmTenant } from "@/lib/communication/wacrm-proxy";
import { insertWhatsappBroadcast } from "@/lib/wacrm/store";
import { reserveWaQuota, WaQuotaExhaustedError } from "@/lib/communication/quota";
import {
  mintBroadcastProposalToken,
  verifyBroadcastProposalToken,
} from "@/lib/ai-gateway/assistant/proposal-token";
import type {
  AssistantAction,
  AssistantActionResult,
} from "@/lib/ai-gateway/assistant/schema";
import {
  inactiveParamsSchema,
  proposeBroadcastParamsSchema,
  vipParamsSchema,
} from "@/lib/ai-gateway/assistant/schema";

interface CustomerRow {
  id: string;
  name: string | null;
  phone: string;
}

function startOfUtcDay(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function listInactiveCustomers(
  businessId: string,
  inactiveDays: number,
  limit: number
): Promise<CustomerRow[]> {
  const db = adminClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(inactiveDays, 7));

  const { data: customers, error } = await db
    .from("customers")
    .select("id, name, phone, updated_at")
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .eq("wa_opt_out", false)
    .not("phone", "is", null)
    .order("updated_at", { ascending: true })
    .limit(Math.min(limit * 4, 200));

  if (error) throw new Error(`inactive customers query failed: ${error.message}`);
  if (!customers?.length) return [];

  const ids = customers.map((c) => c.id as string);
  const cutoffIso = cutoff.toISOString();

  const [{ data: recentEvents }, { data: recentCustomerEvents }] = await Promise.all([
    db
      .from("events")
      .select("customer_id")
      .in("customer_id", ids)
      .gte("occurred_at", cutoffIso),
    db
      .from("customer_events")
      .select("customer_id")
      .in("customer_id", ids)
      .gte("created_at", cutoffIso),
  ]);

  const active = new Set<string>();
  for (const row of recentEvents ?? []) {
    if (row.customer_id) active.add(row.customer_id as string);
  }
  for (const row of recentCustomerEvents ?? []) {
    if (row.customer_id) active.add(row.customer_id as string);
  }

  return customers
    .filter((c) => !active.has(c.id as string))
    .slice(0, limit)
    .map((c) => ({
      id: c.id as string,
      name: (c.name as string | null) ?? null,
      phone: c.phone as string,
    }));
}

async function listVipCustomers(
  businessId: string,
  limit: number,
  minSpend?: number
): Promise<(CustomerRow & { totalSpend: number })[]> {
  const db = adminClient();
  let query = db
    .from("customer_analytics")
    .select("customer_id, total_spend")
    .eq("business_id", businessId)
    .order("total_spend", { ascending: false })
    .limit(limit);

  if (minSpend != null && minSpend > 0) {
    query = query.gte("total_spend", minSpend);
  }

  const { data: analyticsRows, error } = await query;
  if (error) throw new Error(`VIP customers query failed: ${error.message}`);
  if (!analyticsRows?.length) return [];

  const spendById = new Map(
    analyticsRows.map((row) => [row.customer_id as string, Number(row.total_spend) || 0])
  );
  const ids = [...spendById.keys()];

  const { data: customers, error: customerError } = await db
    .from("customers")
    .select("id, name, phone, deleted_at")
    .eq("business_id", businessId)
    .in("id", ids)
    .is("deleted_at", null)
    .not("phone", "is", null);

  if (customerError) throw new Error(`VIP customers lookup failed: ${customerError.message}`);

  return (customers ?? [])
    .map((c) => ({
      id: c.id as string,
      name: (c.name as string | null) ?? null,
      phone: c.phone as string,
      totalSpend: spendById.get(c.id as string) ?? 0,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend)
    .slice(0, limit);
}

export async function executeAssistantAction(
  repo: TenantRepository,
  action: AssistantAction,
  rawParams: Record<string, unknown>
): Promise<AssistantActionResult> {
  const businessId = repo.businessId;

  switch (action) {
    case "get_analytics_overview": {
      const analyticsRepo = new AnalyticsRepository(repo);
      const totals = await analyticsRepo.businessTotals();
      const overview = toAnalyticsOverviewDTO(totals);
      return {
        summary: `Business totals: ${overview.customers} customers, ${overview.plays} plays, ${overview.redeemed} total redemptions, ${overview.coupons} coupons issued.`,
        data: { overview },
      };
    }

    case "get_communication_stats": {
      const integration = await getWacrmIntegration(businessId);
      if (!integration || integration.status === "disconnected") {
        return {
          summary: "WACRM is not connected — WhatsApp communication stats are unavailable.",
          data: { connected: false },
        };
      }

      const db = adminClient();
      const waEvents = [
        "whatsapp.queue",
        "whatsapp.sent",
        "whatsapp.delivered",
        "whatsapp.read",
        "whatsapp.failed",
      ] as const;

      const funnel = Object.fromEntries(
        await Promise.all(
          waEvents.map(async (eventType) => {
            const { count, error } = await db
              .from("campaign_events")
              .select("id", { count: "exact", head: true })
              .eq("business_id", businessId)
              .eq("event_type", eventType)
              .eq("metadata->>channel", "wacrm");
            if (error) throw new Error(error.message);
            return [eventType, count ?? 0] as const;
          })
        )
      );

      return {
        summary: `WhatsApp funnel — sent: ${funnel["whatsapp.sent"] ?? 0}, delivered: ${funnel["whatsapp.delivered"] ?? 0}, read: ${funnel["whatsapp.read"] ?? 0}.`,
        data: { funnel, connected: true },
      };
    }

    case "count_coupons_redeemed_today": {
      const db = adminClient();
      const { count, error } = await db
        .from("campaign_events")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("event_type", "coupon.redeemed")
        .gte("created_at", startOfUtcDay());

      if (error) throw new Error(error.message);

      const n = count ?? 0;
      return {
        summary: `${n} coupon${n === 1 ? "" : "s"} redeemed today (UTC).`,
        data: { count: n },
      };
    }

    case "list_inactive_customers": {
      const params = inactiveParamsSchema.parse(rawParams);
      const rows = await listInactiveCustomers(
        businessId,
        params.inactiveDays,
        params.limit
      );
      return {
        summary: `Found ${rows.length} inactive customer${rows.length === 1 ? "" : "s"} (no activity in ${params.inactiveDays} days).`,
        data: {
          inactiveDays: params.inactiveDays,
          customers: rows,
        },
      };
    }

    case "list_vip_customers": {
      const params = vipParamsSchema.parse(rawParams);
      const rows = await listVipCustomers(businessId, params.limit, params.minSpend);
      return {
        summary: `Top ${rows.length} VIP customer${rows.length === 1 ? "" : "s"} by spend.`,
        data: { customers: rows },
      };
    }

    case "propose_broadcast": {
      const params = proposeBroadcastParamsSchema.parse(rawParams);
      const wacrm = await requireWacrmTenant(businessId);
      if (!wacrm.ok) {
        return {
          summary: "Cannot prepare a broadcast — WACRM is not connected.",
          data: { connected: false },
        };
      }

      const recipients =
        params.audience === "inactive"
          ? await listInactiveCustomers(businessId, params.inactiveDays, params.limit)
          : await listVipCustomers(businessId, params.limit).then((rows) =>
              rows.map(({ id, name, phone }) => ({ id, name, phone }))
            );

      const phones = [...new Set(recipients.map((r) => r.phone).filter(Boolean))];
      const name =
        params.name ??
        `${params.audience === "inactive" ? "Win-back" : "VIP"} broadcast ${new Date().toISOString().slice(0, 10)}`;

      return {
        summary:
          phones.length > 0
            ? `Prepared broadcast to ${phones.length} ${params.audience} customer${phones.length === 1 ? "" : "s"}. Confirm to launch via WhatsApp.`
            : `No eligible ${params.audience} customers with phone numbers were found.`,
        data: { recipientCount: phones.length },
        proposal: {
          name,
          templateName: params.templateName,
          templateLanguage: params.templateLanguage,
          phones,
          segment: `assistant:${params.audience}`,
          audience: params.audience,
          recipientCount: phones.length,
          sample: recipients.slice(0, 5).map((r) => ({ name: r.name, phone: r.phone })),
          proposalToken: mintBroadcastProposalToken({
            businessId,
            name,
            templateLanguage: params.templateLanguage,
            phones,
            segment: `assistant:${params.audience}`,
            audience: params.audience,
          }),
        },
      };
    }

    default:
      return { summary: "Unknown action." };
  }
}

export async function confirmAssistantBroadcast(
  repo: TenantRepository,
  input: {
    proposalToken: string;
    templateName: string;
  }
): Promise<{ broadcastId: string; accepted: number; rejected: number }> {
  const proposal = verifyBroadcastProposalToken(input.proposalToken, repo.businessId);

  const wacrm = await requireWacrmTenant(repo.businessId);
  if (!wacrm.ok) {
    throw new Error("WACRM is not connected");
  }

  try {
    await reserveWaQuota(repo.businessId, proposal.phones.length);
  } catch (err) {
    if (err instanceof WaQuotaExhaustedError) {
      throw new Error("WhatsApp message quota exhausted for this broadcast");
    }
    throw err;
  }

  const launch = await wacrm.tenant.client.launchBroadcast({
    name: proposal.name,
    template_name: input.templateName,
    template_language: proposal.templateLanguage,
    recipients: proposal.phones.map((to) => ({ to })),
  });

  await insertWhatsappBroadcast(repo.businessId, {
    wacrm_broadcast_id: launch.broadcast_id,
    name: proposal.name,
    template_name: input.templateName,
    template_language: proposal.templateLanguage,
    segment: proposal.segment,
    total_recipients: launch.total_recipients,
    accepted: launch.accepted,
    rejected: launch.rejected,
    status: launch.status,
  });

  await repo.audit("communication.broadcast", "whatsapp_broadcast", null, {
    broadcastId: launch.broadcast_id,
    recipients: launch.accepted,
    source: "ai_assistant",
  });

  return {
    broadcastId: launch.broadcast_id,
    accepted: launch.accepted,
    rejected: launch.rejected,
  };
}
