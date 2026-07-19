import "server-only";

import { adminClient, recordCampaignEvent } from "@/lib/db/rpc";
import { getWacrmForBusiness } from "@/lib/wacrm/adapter";
import { getWatiForBusiness } from "@/lib/wati/adapter";
import { WacrmApiError } from "@/lib/wacrm/client";
import { CommunicationEvents } from "@/lib/communication/events";
import { getCommunicationRule } from "@/lib/communication/rules";
import { getActiveWhatsAppProvider } from "@/lib/communication/provider";
import { recordCommunicationTimelineEvent } from "@/lib/communication/timeline";
import { reserveWaQuota, WaQuotaExhaustedError } from "@/lib/communication/quota";
import type { CommunicationDispatchJob, CommunicationJobPayload } from "@/lib/communication/outbox";

interface CustomerRow {
  id: string;
  phone: string;
  name: string;
  wa_opt_out: boolean;
}

interface BusinessRow {
  id: string;
  name: string;
  wa_messages_sent: number;
  wa_messages_quota: number;
}

interface TemplateConfig {
  templateName: string;
  templateLanguage: string;
}

async function loadBusiness(businessId: string): Promise<BusinessRow | null> {
  const { data } = await adminClient()
    .from("businesses")
    .select("id, name, wa_messages_sent, wa_messages_quota")
    .eq("id", businessId)
    .maybeSingle<BusinessRow>();
  return data ?? null;
}

async function resolveCustomer(
  businessId: string,
  payload: CommunicationJobPayload
): Promise<CustomerRow | null> {
  if (payload.customerId) {
    const { data } = await adminClient()
      .from("customers")
      .select("id, phone, name, wa_opt_out")
      .eq("business_id", businessId)
      .eq("id", payload.customerId)
      .maybeSingle<CustomerRow>();
    if (data) return data;
  }

  if (payload.phone) {
    const { data } = await adminClient()
      .from("customers")
      .select("id, phone, name, wa_opt_out")
      .eq("business_id", businessId)
      .eq("phone", payload.phone)
      .maybeSingle<CustomerRow>();
    if (data) return data;
  }

  return null;
}

function readStreamField(payload: CommunicationJobPayload, key: string): unknown {
  const stream = payload.streamPayload;
  if (stream && typeof stream === "object" && key in stream) {
    return (stream as Record<string, unknown>)[key];
  }
  return undefined;
}

function buildTemplateParams(
  eventType: string,
  payload: CommunicationJobPayload,
  customer: CustomerRow,
  businessName: string
): string[] {
  const name = payload.customerName ?? customer.name ?? "Customer";

  switch (eventType) {
    case CommunicationEvents.COUPON_REDEEMED:
      return [name, payload.prizeName ?? "Reward", payload.couponCode ?? ""];
    case CommunicationEvents.COUPON_GENERATED:
      return [name, payload.prizeName ?? "Prize", payload.couponCode ?? ""];
    case CommunicationEvents.LOYALTY_POINTS_ADDED: {
      const delta =
        payload.pointsDelta ??
        (typeof readStreamField(payload, "delta") === "number"
          ? (readStreamField(payload, "delta") as number)
          : 0);
      return [name, String(delta), businessName];
    }
    case CommunicationEvents.TIER_UPGRADED: {
      const tier =
        payload.tierName ??
        (typeof readStreamField(payload, "to_tier") === "string"
          ? (readStreamField(payload, "to_tier") as string)
          : "Member");
      return [name, tier, businessName];
    }
    case CommunicationEvents.PURCHASE_COMPLETED: {
      const total =
        payload.orderTotal ??
        (typeof readStreamField(payload, "total") === "string"
          ? (readStreamField(payload, "total") as string)
          : typeof readStreamField(payload, "total_price") === "string"
            ? (readStreamField(payload, "total_price") as string)
            : "");
      return [name, total, businessName];
    }
    case CommunicationEvents.BIRTHDAY_TODAY:
      return [name, businessName];
    case CommunicationEvents.CUSTOMER_INACTIVE:
      return [name, businessName];
    case CommunicationEvents.REWARD_WON:
      return [name, payload.prizeName ?? "Prize"];
    case CommunicationEvents.CUSTOMER_CREATED:
    case CommunicationEvents.CUSTOMER_REGISTERED:
    default:
      return [name, businessName];
  }
}

async function resolveTemplate(
  businessId: string,
  eventType: string,
  provider: "wacrm" | "wati"
): Promise<TemplateConfig | null> {
  if (eventType === CommunicationEvents.COUPON_GENERATED) {
    if (provider === "wacrm") {
      const tenant = await getWacrmForBusiness(businessId);
      if (!tenant?.integration.coupon_template_name || !tenant.integration.auto_send_coupons) {
        return null;
      }
      return {
        templateName: tenant.integration.coupon_template_name,
        templateLanguage: tenant.integration.coupon_template_language || "en",
      };
    }
    const tenant = await getWatiForBusiness(businessId);
    if (!tenant?.integration.coupon_template_name || !tenant.integration.auto_send_coupons) {
      return null;
    }
    return {
      templateName: tenant.integration.coupon_template_name,
      templateLanguage: tenant.integration.coupon_template_language || "en",
    };
  }

  const rule = await getCommunicationRule(businessId, eventType);
  if (!rule?.enabled || !rule.template_name) return null;
  return {
    templateName: rule.template_name,
    templateLanguage: rule.template_language || "en",
  };
}

async function shouldSkipCouponJob(
  businessId: string,
  payload: CommunicationJobPayload
): Promise<boolean> {
  if (!payload.couponCode) return true;
  const { data } = await adminClient()
    .from("coupons")
    .select("wa_status")
    .eq("business_id", businessId)
    .eq("code", payload.couponCode)
    .maybeSingle<{ wa_status: string }>();
  return !data || data.wa_status === "sent" || data.wa_status === "delivered" || data.wa_status === "read";
}

async function sendWacrmTemplate(args: {
  businessId: string;
  business: BusinessRow;
  customer: CustomerRow;
  campaignId: string | null;
  eventType: string;
  template: TemplateConfig;
  params: string[];
  payload: CommunicationJobPayload;
}): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean }> {
  const tenant = await getWacrmForBusiness(args.businessId);
  if (!tenant) return { ok: false, error: "WACRM not connected", retryable: false };

  if (args.customer.wa_opt_out) return { ok: true };

  try {
    await reserveWaQuota(args.businessId, 1);
  } catch (err) {
    if (err instanceof WaQuotaExhaustedError) {
      return { ok: false, error: "quota_exhausted", retryable: true };
    }
    throw err;
  }

  try {
    const result = await tenant.client.sendTemplate({
      to: args.customer.phone,
      templateName: args.template.templateName,
      language: args.template.templateLanguage,
      params: args.params,
    });

    let couponId: string | null = null;
    if (args.payload.couponCode) {
      const { data: coupon } = await adminClient()
        .from("coupons")
        .select("id, wa_attempts")
        .eq("business_id", args.businessId)
        .eq("code", args.payload.couponCode)
        .maybeSingle<{ id: string; wa_attempts: number }>();
      if (coupon) {
        couponId = coupon.id;
        await adminClient()
          .from("coupons")
          .update({ wa_status: "sent", wa_attempts: coupon.wa_attempts + 1 })
          .eq("id", coupon.id);
      }
    }

    await adminClient().from("wa_message_map").insert({
      business_id: args.businessId,
      whatsapp_message_id: result.whatsapp_message_id,
      wacrm_message_id: result.message_id,
      wacrm_conversation_id: result.conversation_id,
      campaign_id: args.campaignId,
      customer_id: args.customer.id,
      coupon_id: couponId,
      purpose: "other",
      status: "sent",
    });

    const meta = {
      template: args.template.templateName,
      channel: "wacrm",
      eventType: args.eventType,
      wamid: result.whatsapp_message_id,
      ...(args.payload.couponCode ? { couponCode: args.payload.couponCode } : {}),
    };

    await recordCampaignEvent({
      businessId: args.businessId,
      campaignId: args.campaignId,
      actorType: "worker",
      eventType: "whatsapp.sent",
      metadata: meta,
    });

    await recordCommunicationTimelineEvent({
      businessId: args.businessId,
      customerId: args.customer.id,
      campaignId: args.campaignId,
      eventName: "whatsapp.sent",
      payload: meta,
      dedupKey: args.payload.couponCode
        ? `wa:sent:${args.payload.couponCode}`
        : `wa:sent:job:${args.eventType}:${args.customer.id}`,
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const retryable = err instanceof WacrmApiError ? err.status === 429 || err.status >= 500 : true;
    return { ok: false, error: message, retryable };
  }
}

async function sendWatiTemplate(args: {
  businessId: string;
  business: BusinessRow;
  customer: CustomerRow;
  campaignId: string | null;
  eventType: string;
  template: TemplateConfig;
  params: string[];
  payload: CommunicationJobPayload;
}): Promise<{ ok: true } | { ok: false; error: string; retryable: boolean }> {
  const tenant = await getWatiForBusiness(args.businessId);
  if (!tenant) return { ok: false, error: "WATI not connected", retryable: false };

  if (args.customer.wa_opt_out) return { ok: true };

  try {
    await reserveWaQuota(args.businessId, 1);
  } catch (err) {
    if (err instanceof WaQuotaExhaustedError) {
      return { ok: false, error: "quota_exhausted", retryable: true };
    }
    throw err;
  }

  try {
    const customParams = args.params.map((value, index) => ({
      name: String(index + 1),
      value,
    }));

    const response = await tenant.client.sendTemplate({
      phoneNumber: args.customer.phone,
      templateName: args.template.templateName,
      broadcastName: `comm_${args.eventType}_${args.customer.id}`,
      channel: tenant.integration.channel_id,
      params: customParams,
    });

    const meta = {
      template: args.template.templateName,
      channel: "wati",
      eventType: args.eventType,
      broadcastId: response.broadcast_id,
      ...(args.payload.couponCode ? { couponCode: args.payload.couponCode } : {}),
    };

    await recordCampaignEvent({
      businessId: args.businessId,
      campaignId: args.campaignId,
      actorType: "worker",
      eventType: "whatsapp.sent",
      metadata: meta,
    });

    await recordCommunicationTimelineEvent({
      businessId: args.businessId,
      customerId: args.customer.id,
      campaignId: args.campaignId,
      eventName: "whatsapp.sent",
      payload: meta,
      dedupKey: args.payload.couponCode
        ? `wa:sent:${args.payload.couponCode}`
        : `wa:sent:job:${args.eventType}:${args.customer.id}`,
    });

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message, retryable: true };
  }
}

/** Process one claimed outbox job. Returns whether the job succeeded. */
export async function processCommunicationJob(
  job: CommunicationDispatchJob
): Promise<{ success: boolean; error?: string; retryable?: boolean }> {
  const provider = await getActiveWhatsAppProvider(job.business_id);
  if (!provider) {
    return { success: false, error: "no_active_provider", retryable: true };
  }

  const payload = (job.payload ?? {}) as CommunicationJobPayload;

  if (job.event_type === CommunicationEvents.COUPON_GENERATED) {
    const skip = await shouldSkipCouponJob(job.business_id, payload);
    if (skip) return { success: true };
  }

  const template = await resolveTemplate(job.business_id, job.event_type, provider);
  if (!template) {
    return { success: false, error: "no_template_configured", retryable: false };
  }

  const business = await loadBusiness(job.business_id);
  if (!business) {
    return { success: false, error: "business_not_found", retryable: false };
  }

  const customer = await resolveCustomer(job.business_id, payload);
  if (!customer?.phone) {
    return { success: false, error: "customer_phone_missing", retryable: false };
  }

  const params = buildTemplateParams(
    job.event_type,
    payload,
    customer,
    business.name
  );

  const sendArgs = {
    businessId: job.business_id,
    business,
    customer,
    campaignId: payload.campaignId ?? null,
    eventType: job.event_type,
    template,
    params,
    payload,
  };

  const result =
    provider === "wacrm"
      ? await sendWacrmTemplate(sendArgs)
      : await sendWatiTemplate(sendArgs);

  if (result.ok) return { success: true };
  return { success: false, error: result.error, retryable: result.retryable };
}
