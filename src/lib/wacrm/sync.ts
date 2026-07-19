import { adminClient as supabaseAdmin, recordCampaignEvent } from "@/lib/db/rpc";
import { WacrmApiError } from "@/lib/wacrm/client";
import { getWacrmForBusiness, type TenantWacrm } from "@/lib/wacrm/adapter";
import { recordCommunicationTimelineEvent } from "@/lib/communication/timeline";
import { reserveWaQuota, WaQuotaExhaustedError } from "@/lib/communication/quota";
import type { PlayResult } from "@/lib/types";

interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  phone: string;
  city: string | null;
  wa_messages_sent: number;
  wa_messages_quota: number;
}

interface CustomerRow {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  wa_opt_out: boolean;
  wacrm_contact_id: string | null;
}

async function loadBusinessBySlug(slug: string): Promise<BusinessRow | null> {
  const { data } = await supabaseAdmin()
    .from("businesses")
    .select("id, name, slug, phone, city, wa_messages_sent, wa_messages_quota")
    .eq("slug", slug)
    .maybeSingle<BusinessRow>();
  return data ?? null;
}

async function loadCustomerByPhone(
  businessId: string,
  phone: string
): Promise<CustomerRow | null> {
  const { data } = await supabaseAdmin()
    .from("customers")
    .select("id, phone, name, email, wa_opt_out, wacrm_contact_id")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle<CustomerRow>();
  return data ?? null;
}

function buildContactTags(campaignSlug: string, customerId: string | null): string[] {
  const tags = ["engageos", `campaign:${campaignSlug}`];
  if (customerId) tags.push(`customer:${customerId}`);
  return tags;
}

async function syncContactToWacrm(args: {
  tenant: TenantWacrm;
  businessId: string;
  phone: string;
  name: string;
  campaignSlug: string;
  customer: CustomerRow | null;
  extraTags?: string[];
}): Promise<string | null> {
  const tags = [
    ...buildContactTags(args.campaignSlug, args.customer?.id ?? null),
    ...(args.extraTags ?? []),
  ];

  try {
    const contact = await args.tenant.client.upsertContact({
      phone: args.phone,
      name: args.name,
      email: args.customer?.email ?? null,
      tags,
    });

    if (args.customer && args.customer.wacrm_contact_id !== contact.id) {
      await supabaseAdmin()
        .from("customers")
        .update({ wacrm_contact_id: contact.id })
        .eq("business_id", args.businessId)
        .eq("id", args.customer.id);
    }

    return contact.id;
  } catch (err) {
    console.error("syncContactToWacrm failed:", err);
    return args.customer?.wacrm_contact_id ?? null;
  }
}

async function deliverWacrmCoupon(args: {
  tenant: TenantWacrm;
  business: BusinessRow;
  campaignId: string | null;
  customer: CustomerRow | null;
  phone: string;
  customerName: string;
  prizeName: string;
  couponCode: string;
}): Promise<"sent" | "failed" | "skipped"> {
  const { tenant, business, campaignId } = args;
  const { integration } = tenant;

  if (!integration.coupon_template_name) return "skipped";
  if (!integration.auto_send_coupons) return "skipped";
  if (args.customer?.wa_opt_out) return "skipped";

  const { data: coupon } = await supabaseAdmin()
    .from("coupons")
    .select("id, wa_attempts")
    .eq("business_id", business.id)
    .eq("code", args.couponCode)
    .maybeSingle<{ id: string; wa_attempts: number }>();

  const baseEvent = {
    businessId: business.id,
    campaignId,
    actorType: "system" as const,
    actorId: null,
  };

  if (coupon) {
    const { data: claimed } = await supabaseAdmin().rpc("claim_coupon_wa_send", {
      p_business_id: business.id,
      p_coupon_id: coupon.id,
    });
    if (!claimed) return "skipped";
  }

  try {
    await reserveWaQuota(business.id, 1);
  } catch (err) {
    if (err instanceof WaQuotaExhaustedError) {
      if (coupon) {
        await supabaseAdmin()
          .from("coupons")
          .update({ wa_status: "pending" })
          .eq("id", coupon.id)
          .eq("wa_status", "sending");
      }
      await recordCampaignEvent({
        ...baseEvent,
        eventType: "whatsapp.failed",
        metadata: { reason: "quota_exhausted", couponCode: args.couponCode, channel: "wacrm" },
      });
      return "failed";
    }
    throw err;
  }

  await recordCampaignEvent({
    ...baseEvent,
    eventType: "whatsapp.queue",
    metadata: { couponCode: args.couponCode, channel: "wacrm" },
  });

  try {
    const result = await tenant.client.sendTemplate({
      to: args.phone,
      templateName: integration.coupon_template_name,
      language: integration.coupon_template_language || "en",
      params: [args.customerName, args.prizeName, args.couponCode],
    });

    if (coupon) {
      await supabaseAdmin()
        .from("coupons")
        .update({ wa_status: "sent" })
        .eq("business_id", business.id)
        .eq("id", coupon.id);
    }

    await supabaseAdmin().from("wa_message_map").insert({
      business_id: business.id,
      whatsapp_message_id: result.whatsapp_message_id,
      wacrm_message_id: result.message_id,
      wacrm_conversation_id: result.conversation_id,
      campaign_id: campaignId,
      customer_id: args.customer?.id ?? null,
      coupon_id: coupon?.id ?? null,
      purpose: "coupon_delivery",
      status: "sent",
    });

    await recordCampaignEvent({
      ...baseEvent,
      eventType: "whatsapp.sent",
      metadata: {
        couponCode: args.couponCode,
        wamid: result.whatsapp_message_id,
        template: integration.coupon_template_name,
        channel: "wacrm",
      },
    });

    await recordCommunicationTimelineEvent({
      businessId: business.id,
      customerId: args.customer?.id ?? null,
      campaignId,
      eventName: "whatsapp.sent",
      payload: {
        couponCode: args.couponCode,
        wamid: result.whatsapp_message_id,
        template: integration.coupon_template_name,
        channel: "wacrm",
      },
      dedupKey: `wa:sent:${args.couponCode}`,
    });

    return "sent";
  } catch (err) {
    console.error("WACRM coupon send failed:", err);

    if (coupon) {
      await supabaseAdmin()
        .from("coupons")
        .update({ wa_status: "failed" })
        .eq("business_id", business.id)
        .eq("id", coupon.id);
    }

    await recordCampaignEvent({
      ...baseEvent,
      eventType: "whatsapp.failed",
      metadata: {
        couponCode: args.couponCode,
        channel: "wacrm",
        reason: err instanceof WacrmApiError ? `wacrm_error_${err.status}` : "send_error",
        detail: err instanceof Error ? err.message : String(err),
      },
    });

    return "failed";
  }
}

/** Sync a single EngageOS customer to WACRM (API / manual upsert). */
export async function syncCustomerToWacrm(params: {
  businessId: string;
  phone: string;
  name?: string | null;
  email?: string | null;
  customerId?: string;
  tags?: string[];
}): Promise<void> {
  try {
    const tenant = await getWacrmForBusiness(params.businessId);
    if (!tenant) return;

    const tags = ["engageos", ...(params.tags ?? [])];
    if (params.customerId) tags.push(`customer:${params.customerId}`);

    const contact = await tenant.client.upsertContact({
      phone: params.phone,
      name: params.name ?? undefined,
      email: params.email ?? null,
      tags,
    });

    if (params.customerId) {
      await supabaseAdmin()
        .from("customers")
        .update({ wacrm_contact_id: contact.id })
        .eq("business_id", params.businessId)
        .eq("id", params.customerId);
    }
  } catch (err) {
    console.error("syncCustomerToWacrm failed:", err);
  }
}

/** Post-play sync for WACRM WhatsApp integration. */
export async function syncPlayToWacrm(params: {
  merchantSlug: string;
  campaignSlug: string;
  phone: string;
  name: string;
  result: PlayResult;
}): Promise<void> {
  const { result } = params;
  if (result.status !== "ok") return;

  try {
    const business = await loadBusinessBySlug(params.merchantSlug);
    if (!business) return;

    const tenant = await getWacrmForBusiness(business.id);
    if (!tenant) return;

    const { data: campaign } = await supabaseAdmin()
      .from("campaigns")
      .select("id, name, slug")
      .eq("business_id", business.id)
      .eq("slug", params.campaignSlug)
      .maybeSingle<{ id: string; name: string; slug: string }>();

    const customer = await loadCustomerByPhone(business.id, params.phone);

    await syncContactToWacrm({
      tenant,
      businessId: business.id,
      phone: params.phone,
      name: params.name,
      campaignSlug: params.campaignSlug,
      customer,
      extraTags: result.won ? ["winner"] : undefined,
    });

    if (result.won && result.coupon_code) {
      await deliverWacrmCoupon({
        tenant,
        business,
        campaignId: campaign?.id ?? null,
        customer,
        phone: params.phone,
        customerName: params.name,
        prizeName: result.prize_name ?? "Prize",
        couponCode: result.coupon_code,
      });
    }
  } catch (err) {
    console.error("syncPlayToWacrm failed:", err);
  }
}

/** Tag a redeemed contact inside WACRM. */
export async function syncRedeemToWacrm(params: {
  businessId: string;
  phone: string;
  campaignId: string | null;
}): Promise<void> {
  try {
    const tenant = await getWacrmForBusiness(params.businessId);
    if (!tenant) return;

    const customer = await loadCustomerByPhone(params.businessId, params.phone);
    if (!customer?.wacrm_contact_id) return;

    const contact = await tenant.client.getContact(customer.wacrm_contact_id);
    const existing = contact.tags?.map((t) => t.name) ?? [];
    const merged = [...new Set([...existing, "engageos", "redeemed"])];

    await tenant.client.patchContact(customer.wacrm_contact_id, {
      tags: merged,
    });
  } catch (err) {
    console.error("syncRedeemToWacrm failed:", err);
  }
}

type PendingCouponRow = {
  id: string;
  code: string;
  prize_name: string;
  campaign_id: string;
  customers: {
    id: string;
    phone: string;
    name: string;
    wa_opt_out: boolean;
  };
};

/** Drain pending coupon outbox for a tenant (optionally scoped to one campaign). */
export async function dispatchPendingWacrmCoupons(
  businessId: string,
  limit = 50,
  campaignId?: string
): Promise<{ sent: number; failed: number; error?: string }> {
  const tenant = await getWacrmForBusiness(businessId);
  if (!tenant) {
    return { sent: 0, failed: 0, error: "WACRM is not connected" };
  }

  const { data: business, error: businessError } = await supabaseAdmin()
    .from("businesses")
    .select("id, name, slug, phone, city, wa_messages_sent, wa_messages_quota")
    .eq("id", businessId)
    .maybeSingle<BusinessRow>();
  if (businessError) {
    return { sent: 0, failed: 0, error: businessError.message };
  }
  if (!business) {
    return { sent: 0, failed: 0, error: "Business not found" };
  }

  let query = supabaseAdmin()
    .from("coupons")
    .select(
      "id, code, prize_name, campaign_id, customers!inner(id, phone, name, wa_opt_out)"
    )
    .eq("business_id", businessId)
    .eq("wa_status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (campaignId) {
    query = query.eq("campaign_id", campaignId);
  }

  const { data: rows, error } = await query;
  if (error) {
    return { sent: 0, failed: 0, error: error.message };
  }

  let sent = 0;
  let failed = 0;

  for (const raw of rows ?? []) {
    const customer = Array.isArray(raw.customers) ? raw.customers[0] : raw.customers;
    if (!customer) continue;

    const row: PendingCouponRow = {
      id: raw.id,
      code: raw.code,
      prize_name: raw.prize_name,
      campaign_id: raw.campaign_id,
      customers: customer,
    };

    const outcome = await deliverWacrmCoupon({
      tenant,
      business,
      campaignId: row.campaign_id,
      customer: {
        id: row.customers.id,
        phone: row.customers.phone,
        name: row.customers.name,
        email: null,
        wa_opt_out: row.customers.wa_opt_out,
        wacrm_contact_id: null,
      },
      phone: row.customers.phone,
      customerName: row.customers.name,
      prizeName: row.prize_name,
      couponCode: row.code,
    });

    if (outcome === "sent") sent += 1;
    else if (outcome === "failed") failed += 1;
  }

  return { sent, failed };
}
