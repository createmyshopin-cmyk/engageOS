import { adminClient, adminClient as supabaseAdmin, recordCampaignEvent } from "@/lib/db/rpc";
import { WacrmApiError } from "@/lib/wacrm/client";
import { flagIntegrationError, getWacrmForBusiness, type TenantWacrm } from "@/lib/wacrm/adapter";
import { recordMessageMap, setCustomerContactId } from "@/lib/wacrm/store";
import type { PlayResult, RedeemResult } from "@/lib/types";

/**
 * Sync engine: EngageOS → wacrm.
 *
 * EngageOS stays the campaign engine and the system of record for campaign
 * events (the immutable campaign_events log, written by the SQL engine).
 * wacrm stays the CRM and the system of record for contacts/conversations.
 * This module translates EngageOS lifecycle moments into wacrm contact
 * upserts, tags, and template messages — and NOTHING is ever duplicated:
 * only the mapping (wacrm_contact_id, wamid) is stored on our side.
 *
 * Every entry point is best-effort and swallow-on-error: a CRM outage can
 * never break a customer's scratch, a redemption, or a merchant action.
 * All calls are invoked via next/server `after()` so they run post-response.
 */

const ENGAGEOS_TAG = "engageos";
const WINNER_TAG = "winner";
const REDEEMED_TAG = "redeemed";
const OPT_OUT_TAG = "opted-out";

interface BusinessRow {
  id: string;
  name: string;
  wa_messages_sent: number;
  wa_messages_quota: number;
}

interface CustomerRow {
  id: string;
  phone: string;
  name: string;
  wacrm_contact_id: string | null;
  wa_opt_out: boolean;
}

interface PendingCouponRow {
  id: string;
  code: string;
  prize_name: string;
  campaign_id: string | null;
  customer_id: string | null;
  customers: CustomerRow;
}

interface SegmentRecipientQueryRow {
  customer_id: string;
  customers: {
    phone: string;
    name: string;
    wa_opt_out: boolean;
  } | null;
}

/**
 * Upsert an EngageOS customer as a wacrm contact and make sure it carries
 * (at least) the given tags. wacrm's POST /contacts is find-or-create and
 * PATCH replaces tags wholesale, so we compute the union before patching.
 * Returns the wacrm contact id.
 */
async function upsertContactWithTags(
  tenant: TenantWacrm,
  customer: { phone: string; name: string },
  tags: string[]
): Promise<string> {
  const { data: contact } = await tenant.client.upsertContact({
    phone: customer.phone,
    name: customer.name,
    tags,
  });
  const existing = new Set(contact.tags.map((t) => t.name));
  const missing = tags.filter((t) => !existing.has(t));
  if (missing.length > 0) {
    await tenant.client.updateContact(contact.id, {
      tags: [...existing, ...missing],
    });
  }
  return contact.id;
}

async function loadBusinessBySlug(slug: string): Promise<BusinessRow | null> {
  const { data } = await supabaseAdmin()
    .from("businesses")
    .select("id, name, wa_messages_sent, wa_messages_quota")
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
    .select("id, phone, name, wacrm_contact_id, wa_opt_out")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .maybeSingle<CustomerRow>();
  return data ?? null;
}

/**
 * Post-play sync — the hot path. Fired from /api/play via after(), so the
 * customer's scratch response is never blocked by CRM I/O.
 *
 *   customer.registered  → find-or-create wacrm contact (+ campaign tag)
 *   prize won            → 'winner' tag
 *   coupon.generated     → optional coupon template message via wacrm,
 *                          delivery tracked back into campaign_events
 */
export async function syncPlayToWacrm(params: {
  merchantSlug: string;
  campaignSlug: string;
  phone: string;
  name: string;
  result: PlayResult;
}): Promise<void> {
  const { result } = params;
  if (result.status !== "ok") return; // no registration happened

  try {
    const business = await loadBusinessBySlug(params.merchantSlug);
    if (!business) return;
    const tenant = await getWacrmForBusiness(business.id);
    if (!tenant) return; // merchant has not connected wacrm

    const { data: campaign } = await supabaseAdmin()
      .from("campaigns")
      .select("id, name, slug")
      .eq("business_id", business.id)
      .eq("slug", params.campaignSlug)
      .maybeSingle<{ id: string; name: string; slug: string }>();

    const customer = await loadCustomerByPhone(business.id, params.phone);

    // 1) Contact sync (find-or-create + tags). Never duplicated: wacrm
    //    dedupes by phone; we store only the returned contact id.
    const tags = [ENGAGEOS_TAG];
    if (campaign) tags.push(campaign.slug);
    if (result.won) tags.push(WINNER_TAG);

    const contactId = await upsertContactWithTags(
      tenant,
      { phone: params.phone, name: params.name },
      tags
    );
    if (customer && customer.wacrm_contact_id !== contactId) {
      await setCustomerContactId(business.id, customer.id, contactId);
    }

    // 2) Coupon delivery via wacrm (winners only, opt-in per tenant).
    if (result.won && result.coupon_code) {
      await deliverCoupon({
        tenant,
        business,
        campaignId: campaign?.id ?? null,
        customer,
        phone: params.phone,
        customerName: params.name,
        prizeName: result.prize_name,
        couponCode: result.coupon_code,
      });
    }
  } catch (err) {
    console.error("syncPlayToWacrm failed:", err);
    if (err instanceof WacrmApiError && err.status === 401) {
      const business = await loadBusinessBySlug(params.merchantSlug);
      if (business) await flagIntegrationError(business.id, err.message);
    }
  }
}

/** Send one coupon template message and account for it everywhere. */
async function deliverCoupon(args: {
  tenant: TenantWacrm;
  business: BusinessRow;
  campaignId: string | null;
  customer: CustomerRow | null;
  phone: string;
  customerName: string;
  prizeName: string;
  couponCode: string;
  /** true = merchant-triggered dispatch; ignores the auto_send toggle. */
  force?: boolean;
}): Promise<"sent" | "failed" | "skipped"> {
  const { tenant, business, campaignId } = args;
  const { integration } = tenant;

  if (!integration.coupon_template_name) return "skipped";
  if (!args.force && !integration.auto_send_coupons) return "skipped";
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
    actorType: "system",
    actorId: null,
  };

  // Quota is a hard COGS ceiling — never overshoot it.
  if (business.wa_messages_sent >= business.wa_messages_quota) {
    await recordCampaignEvent({
      ...baseEvent,
      eventType: "whatsapp.failed",
      metadata: { reason: "quota_exhausted", couponCode: args.couponCode },
    });
    return "failed";
  }

  await recordCampaignEvent({
    ...baseEvent,
    eventType: "whatsapp.queue",
    metadata: { couponCode: args.couponCode, channel: "wacrm" },
  });

  try {
    const { data: sent } = await tenant.client.sendTemplate(args.phone, {
      name: integration.coupon_template_name,
      language: integration.coupon_template_language || "en",
      params: [args.customerName, args.prizeName, args.couponCode],
    });

    await recordMessageMap({
      business_id: business.id,
      whatsapp_message_id: sent.whatsapp_message_id,
      wacrm_message_id: sent.message_id,
      wacrm_conversation_id: sent.conversation_id,
      campaign_id: campaignId,
      customer_id: args.customer?.id ?? null,
      coupon_id: coupon?.id ?? null,
      purpose: "coupon_delivery",
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
        wamid: sent.whatsapp_message_id,
        template: integration.coupon_template_name,
        channel: "wacrm",
      },
    });
    return "sent";
  } catch (err) {
    console.error("wacrm coupon send failed:", err);
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
        reason: err instanceof WacrmApiError ? err.code : "send_error",
        detail: err instanceof Error ? err.message : String(err),
      },
    });
    return "failed";
  }
}

/**
 * Merchant-triggered outbox drain: send every pending coupon (the queue the
 * existing "Retry failed" action refills) through wacrm. Bounded per call.
 */
export async function dispatchPendingCoupons(
  businessId: string,
  limit = 50
): Promise<{ sent: number; failed: number; skipped: number; error?: string }> {
  const db = supabaseAdmin();
  const { data: business } = await db
    .from("businesses")
    .select("id, name, wa_messages_sent, wa_messages_quota")
    .eq("id", businessId)
    .maybeSingle<BusinessRow>();
  if (!business) return { sent: 0, failed: 0, skipped: 0, error: "Business not found" };

  const tenant = await getWacrmForBusiness(businessId);
  if (!tenant) return { sent: 0, failed: 0, skipped: 0, error: "wacrm is not connected" };
  if (!tenant.integration.coupon_template_name) {
    return {
      sent: 0,
      failed: 0,
      skipped: 0,
      error: "Set a coupon template in WhatsApp → Settings first",
    };
  }

  const { data: pending, error } = await db
    .from("coupons")
    .select("id, code, prize_name, campaign_id, customer_id, customers!inner(id, phone, name, wacrm_contact_id, wa_opt_out)")
    .eq("business_id", businessId)
    .eq("status", "issued")
    .eq("wa_status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) return { sent: 0, failed: 0, skipped: 0, error: error.message };

  const counts = { sent: 0, failed: 0, skipped: 0 };
  for (const row of (pending ?? []) as unknown as PendingCouponRow[]) {
    const customer = row.customers;
    const outcome = await deliverCoupon({
      tenant,
      business,
      campaignId: row.campaign_id ?? null,
      customer,
      phone: customer.phone,
      customerName: customer.name,
      prizeName: row.prize_name,
      couponCode: row.code,
      force: true,
    });
    counts[outcome]++;
    // Keep the local quota view honest as we go — deliverCoupon checks it.
    if (outcome === "sent") business.wa_messages_sent++;
  }
  return counts;
}

/**
 * Post-redemption sync — fired from /api/staff/redeem via after().
 * Tags the wacrm contact 'redeemed' so CRM segments/automations can react.
 */
export async function syncRedeemToWacrm(params: {
  businessId: string;
  code: string;
  result: RedeemResult;
}): Promise<void> {
  if (params.result.status !== "redeemed") return;
  try {
    const tenant = await getWacrmForBusiness(params.businessId);
    if (!tenant) return;

    const { data: coupon } = await supabaseAdmin()
      .from("coupons")
      .select("customer_id")
      .eq("business_id", params.businessId)
      .eq("code", params.code)
      .maybeSingle<{ customer_id: string }>();
    if (!coupon) return;

    const { data: customer } = await supabaseAdmin()
      .from("customers")
      .select("id, phone, name, wacrm_contact_id, wa_opt_out")
      .eq("business_id", params.businessId)
      .eq("id", coupon.customer_id)
      .maybeSingle<CustomerRow>();
    if (!customer) return;

    const contactId = await upsertContactWithTags(
      tenant,
      { phone: customer.phone, name: customer.name },
      [ENGAGEOS_TAG, REDEEMED_TAG]
    );
    if (customer.wacrm_contact_id !== contactId) {
      await setCustomerContactId(params.businessId, customer.id, contactId);
    }
  } catch (err) {
    console.error("syncRedeemToWacrm failed:", err);
  }
}

/**
 * Opt a customer out (or back in). Locally flips customers.wa_opt_out;
 * on the wacrm side the contact is tagged 'opted-out' (the public API has
 * no archive endpoint — the tag is the segmentation mechanism).
 */
export async function syncOptOut(
  businessId: string,
  phone: string,
  optOut: boolean
): Promise<{ ok: boolean; error?: string }> {
  const customer = await loadCustomerByPhone(businessId, phone);
  if (!customer) return { ok: false, error: "No customer with that phone" };

  await supabaseAdmin()
    .from("customers")
    .update({ wa_opt_out: optOut })
    .eq("business_id", businessId)
    .eq("id", customer.id);

  try {
    const tenant = await getWacrmForBusiness(businessId);
    if (tenant) {
      const { data: contact } = await tenant.client.upsertContact({
        phone: customer.phone,
        name: customer.name,
      });
      const tags = new Set(contact.tags.map((t) => t.name));
      if (optOut) tags.add(OPT_OUT_TAG);
      else tags.delete(OPT_OUT_TAG);
      await tenant.client.updateContact(contact.id, { tags: [...tags] });
    }
  } catch (err) {
    console.error("syncOptOut → wacrm failed:", err);
  }
  return { ok: true };
}

// ---------- Broadcast segments (EngageOS data → wacrm recipients) ----------

export type BroadcastSegment = "all" | "winners" | "redeemed" | `campaign:${string}`;

export interface SegmentRecipient {
  phone: string;
  name: string;
}

/**
 * Resolve a broadcast segment from EngageOS's OWN customer/coupon data —
 * this is the campaign engine's value-add on top of wacrm's raw broadcast
 * API. Opted-out customers are always excluded.
 */
export async function resolveSegmentRecipients(
  businessId: string,
  segment: BroadcastSegment
): Promise<SegmentRecipient[]> {
  const db = supabaseAdmin();

  if (segment === "winners" || segment === "redeemed") {
    let q = db
      .from("coupons")
      .select("customer_id, customers!inner(phone, name, wa_opt_out)")
      .eq("business_id", businessId);
    if (segment === "redeemed") q = q.eq("status", "redeemed");
    const { data, error } = await q.limit(10000);
    if (error) throw new Error(`segment ${segment} failed: ${error.message}`);
    const seen = new Map<string, SegmentRecipient>();
    for (const row of (data ?? []) as unknown as SegmentRecipientQueryRow[]) {
      const c = row.customers;
      if (c && !c.wa_opt_out && !seen.has(c.phone)) {
        seen.set(c.phone, { phone: c.phone, name: c.name });
      }
    }
    return [...seen.values()];
  }

  if (segment.startsWith("campaign:")) {
    const campaignId = segment.slice("campaign:".length);
    const { data, error } = await db
      .from("plays")
      .select("customer_id, customers!inner(phone, name, wa_opt_out)")
      .eq("business_id", businessId)
      .eq("campaign_id", campaignId)
      .limit(10000);
    if (error) throw new Error(`segment ${segment} failed: ${error.message}`);
    const seen = new Map<string, SegmentRecipient>();
    for (const row of (data ?? []) as unknown as SegmentRecipientQueryRow[]) {
      const c = row.customers;
      if (c && !c.wa_opt_out && !seen.has(c.phone)) {
        seen.set(c.phone, { phone: c.phone, name: c.name });
      }
    }
    return [...seen.values()];
  }

  // "all"
  const { data, error } = await db
    .from("customers")
    .select("phone, name")
    .eq("business_id", businessId)
    .eq("wa_opt_out", false)
    .limit(10000);
  if (error) throw new Error(`segment all failed: ${error.message}`);
  return ((data ?? []) as SegmentRecipient[]).map(({ phone, name }) => ({ phone, name }));
}
