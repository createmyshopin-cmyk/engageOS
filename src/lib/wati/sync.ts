import { adminClient as supabaseAdmin, recordCampaignEvent } from "@/lib/db/rpc";
import { WatiApiError } from "@/lib/wati/client";
import { getWatiForBusiness, type TenantWati } from "@/lib/wati/adapter";
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
  wa_opt_out: boolean;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = d.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month}, ${year}`;
}

function mapTemplateParams(
  bodyOriginal: string,
  context: {
    customerName: string;
    phone: string;
    merchantName: string;
    campaignName: string;
    prizeName: string;
    couponCode: string;
    endDate: string;
  }
): { name: string; value: string }[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(bodyOriginal)) !== null) {
    if (match[1]) matches.push(match[1].trim());
  }

  if (matches.length === 0) return [];

  // Check if they are simple sequential numbers (e.g. {{1}}, {{2}})
  const isNumeric = matches.every((m) => /^\d+$/.test(m));
  if (isNumeric) {
    let positionalValues = [];
    if (matches.length <= 3) {
      // Traditional 3-variable layout
      positionalValues = [
        context.customerName,
        context.prizeName,
        context.couponCode
      ];
    } else {
      // New premium layout with merchant name and end date
      positionalValues = [
        context.customerName,
        context.merchantName,
        context.prizeName,
        context.couponCode,
        context.endDate,
        context.merchantName
      ];
    }
    return matches.map((m, idx) => ({
      name: m,
      value: positionalValues[idx] || "",
    }));
  }

  // Otherwise, match by WATI Contact variables (case-insensitive, strip symbols)
  return matches.map((m) => {
    const key = m.toLowerCase().replace(/[^a-z0-9]/g, "");
    let value = "";
    
    if (key === "name" || key === "bsuidusername" || key === "externalname" || key === "customername") {
      value = context.customerName;
    } else if (key === "phone" || key === "bsuid") {
      value = context.phone;
    } else if (key === "channel") {
      value = "WhatsApp";
    } else if (key === "source") {
      value = context.campaignName;
    } else if (key === "lastcartitems" || key === "lastcartitemstext" || key === "giftname" || key === "prizename" || key === "reward") {
      value = context.prizeName;
    } else if (key === "lastcarttotalvalue" || key === "lastcarttotalvaluetext" || key === "lastcarttotalvaluetextamount" || key === "couponcode" || key === "code" || key === "externalid") {
      value = context.couponCode;
    } else if (key.includes("merchant") || key.includes("business") || key.includes("team")) {
      value = context.merchantName;
    } else if (key.includes("date") || key.includes("until") || key.includes("expiry") || key.includes("valid")) {
      value = context.endDate;
    } else if (key === "leadstage") {
      value = "Played";
    } else {
      value = "";
    }
    return { name: m, value };
  });
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
    .select("id, phone, name, wa_opt_out")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle<CustomerRow>();
  return data ?? null;
}

/**
 * Post-play sync for WATI WhatsApp integration.
 * Triggers automated coupon delivery via WATI if configured.
 */
export async function syncPlayToWati(params: {
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

    const tenant = await getWatiForBusiness(business.id);
    if (!tenant) return; // Merchant has not connected WATI

    const { data: campaign } = await supabaseAdmin()
      .from("campaigns")
      .select("id, name, slug, ends_at")
      .eq("business_id", business.id)
      .eq("slug", params.campaignSlug)
      .maybeSingle<{ id: string; name: string; slug: string; ends_at: string }>();

    const customer = await loadCustomerByPhone(business.id, params.phone);

    // WATI coupon delivery (winners only, opt-in per tenant)
    if (result.won && result.coupon_code) {
      await deliverWatiCoupon({
        tenant,
        business,
        campaignId: campaign?.id ?? null,
        campaignName: campaign?.name ?? "Scratch & Win",
        campaignEndsAt: campaign?.ends_at ?? null,
        customer,
        phone: params.phone,
        customerName: params.name,
        prizeName: result.prize_name,
        couponCode: result.coupon_code,
      });
    }
    // WATI participation delivery (losers only, opt-in per tenant)
    else if (!result.won) {
      await deliverWatiParticipation({
        tenant,
        business,
        campaignId: campaign?.id ?? null,
        campaignName: campaign?.name ?? "Scratch & Win",
        campaignEndsAt: campaign?.ends_at ?? null,
        customer,
        phone: params.phone,
        customerName: params.name,
      });
    }
  } catch (err) {
    console.error("syncPlayToWati failed:", err);
  }
}

/** Deliver coupon via WATI API v3 */
async function deliverWatiCoupon(args: {
  tenant: TenantWati;
  business: BusinessRow;
  campaignId: string | null;
  campaignName: string;
  campaignEndsAt: string | null;
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
    .select("id, wa_attempts, expires_at")
    .eq("business_id", business.id)
    .eq("code", args.couponCode)
    .maybeSingle<{ id: string; wa_attempts: number; expires_at: string }>();

  const baseEvent = {
    businessId: business.id,
    campaignId,
    actorType: "system" as const,
    actorId: null,
  };

  // Quota checks (hard limit ceiling)
  if (business.wa_messages_sent >= business.wa_messages_quota) {
    await recordCampaignEvent({
      ...baseEvent,
      eventType: "whatsapp.failed",
      metadata: { reason: "quota_exhausted", couponCode: args.couponCode, channel: "wati" },
    });
    return "failed";
  }

  await recordCampaignEvent({
    ...baseEvent,
    eventType: "whatsapp.queue",
    metadata: { couponCode: args.couponCode, channel: "wati" },
  });

  const expiresAt = coupon?.expires_at || args.campaignEndsAt || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = formatDate(expiresAt);

  // Map custom params based on the template's variable list (fetched from WATI)
  let customParams = [
    { name: "1", value: args.customerName },
    { name: "2", value: args.prizeName },
    { name: "3", value: args.couponCode },
  ];

  try {
    const templates = await tenant.client.getTemplates(1, 100);
    const matched = templates.find((t) => t.name === integration.coupon_template_name);
    if (matched) {
      const bodyOriginal = (matched as any).body_original || (matched as any).body || "";
      if (bodyOriginal) {
        customParams = mapTemplateParams(bodyOriginal, {
          customerName: args.customerName,
          phone: args.phone,
          merchantName: business.name,
          campaignName: args.campaignName,
          prizeName: args.prizeName,
          couponCode: args.couponCode,
          endDate,
        });
      }
    }
  } catch (err) {
    console.error("Failed to map WATI custom params, falling back to positional:", err);
  }

  try {
    const response = await tenant.client.sendTemplate({
      phoneNumber: args.phone,
      templateName: integration.coupon_template_name,
      broadcastName: `coupon_${args.couponCode}`,
      channel: integration.channel_id,
      params: customParams,
    });

    if (coupon) {
      await supabaseAdmin()
        .from("coupons")
        .update({ wa_status: "sent", wa_attempts: coupon.wa_attempts + 1 })
        .eq("business_id", business.id)
        .eq("id", coupon.id);
    }

    await supabaseAdmin().rpc("increment_wa_sent", {
      p_business_id: business.id,
      p_count: 1,
    });

    await recordCampaignEvent({
      ...baseEvent,
      eventType: "whatsapp.sent",
      metadata: {
        couponCode: args.couponCode,
        broadcastId: response.broadcast_id,
        template: integration.coupon_template_name,
        channel: "wati",
      },
    });

    return "sent";
  } catch (err) {
    console.error("WATI coupon send failed:", err);

    if (coupon) {
      await supabaseAdmin()
        .from("coupons")
        .update({ wa_status: "failed", wa_attempts: coupon.wa_attempts + 1 })
        .eq("business_id", business.id)
        .eq("id", coupon.id);
    }

    await recordCampaignEvent({
      ...baseEvent,
      eventType: "whatsapp.failed",
      metadata: {
        couponCode: args.couponCode,
        channel: "wati",
        reason: err instanceof WatiApiError ? `wati_error_${err.status}` : "send_error",
        detail: err instanceof Error ? err.message : String(err),
      },
    });

    return "failed";
  }
}

/** Deliver participation message via WATI API v3 (for losers/non-winners) */
async function deliverWatiParticipation(args: {
  tenant: TenantWati;
  business: BusinessRow;
  campaignId: string | null;
  campaignName: string;
  campaignEndsAt: string | null;
  customer: CustomerRow | null;
  phone: string;
  customerName: string;
}): Promise<"sent" | "failed" | "skipped"> {
  const { tenant, business, campaignId } = args;
  const { integration } = tenant;

  if (!integration.participation_template_name) return "skipped";
  if (!integration.auto_send_participation) return "skipped";
  if (args.customer?.wa_opt_out) return "skipped";

  const baseEvent = {
    businessId: business.id,
    campaignId,
    actorType: "system" as const,
    actorId: null,
  };

  // Quota checks (hard limit ceiling)
  if (business.wa_messages_sent >= business.wa_messages_quota) {
    await recordCampaignEvent({
      ...baseEvent,
      eventType: "whatsapp.failed",
      metadata: { reason: "quota_exhausted", channel: "wati", purpose: "participation" },
    });
    return "failed";
  }

  await recordCampaignEvent({
    ...baseEvent,
    eventType: "whatsapp.queue",
    metadata: { channel: "wati", purpose: "participation" },
  });

  const endDate = args.campaignEndsAt ? formatDate(args.campaignEndsAt) : "N/A";

  // Map custom params based on the template's variable list
  let customParams = [
    { name: "1", value: args.customerName },
    { name: "2", value: "Better luck next time!" },
    { name: "3", value: "N/A" },
  ];

  try {
    const templates = await tenant.client.getTemplates(1, 100);
    const matched = templates.find((t) => t.name === integration.participation_template_name);
    if (matched) {
      const bodyOriginal = (matched as any).body_original || (matched as any).body || "";
      if (bodyOriginal) {
        customParams = mapTemplateParams(bodyOriginal, {
          customerName: args.customerName,
          phone: args.phone,
          merchantName: business.name,
          campaignName: args.campaignName,
          prizeName: "Better luck next time!",
          couponCode: "N/A",
          endDate,
        });
      }
    }
  } catch (err) {
    console.error("Failed to map WATI participation custom params, falling back to positional:", err);
  }

  try {
    const response = await tenant.client.sendTemplate({
      phoneNumber: args.phone,
      templateName: integration.participation_template_name,
      broadcastName: `participation_${args.phone}`,
      channel: integration.channel_id,
      params: customParams,
    });

    await supabaseAdmin().rpc("increment_wa_sent", {
      p_business_id: business.id,
      p_count: 1,
    });

    await recordCampaignEvent({
      ...baseEvent,
      eventType: "whatsapp.sent",
      metadata: {
        broadcastId: response.broadcast_id,
        template: integration.participation_template_name,
        channel: "wati",
        purpose: "participation"
      },
    });

    return "sent";
  } catch (err) {
    console.error("WATI participation send failed:", err);

    await recordCampaignEvent({
      ...baseEvent,
      eventType: "whatsapp.failed",
      metadata: {
        channel: "wati",
        purpose: "participation",
        reason: err instanceof WatiApiError ? `wati_error_${err.status}` : "send_error",
        detail: err instanceof Error ? err.message : String(err),
      },
    });

    return "failed";
  }
}
