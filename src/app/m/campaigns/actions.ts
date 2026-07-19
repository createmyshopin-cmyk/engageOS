"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { getShop } from "@/lib/shopify/store";
import { clientIpFromHeaders } from "@/lib/ip";
import { isSafeRedirectUrl, slugify } from "@/lib/validation";
import { uploadCampaignImageFromDataUrl } from "@/lib/images/upload-from-data-url";
import { dispatchPendingCoupons } from "@/lib/whatsapp/gateway";
import type { CampaignEventType, CampaignStatus } from "@/lib/types";
import { z } from "zod";

/** Request context (ip + user agent) for event attribution. */
async function eventContext(): Promise<{ ip: string; userAgent: string | null }> {
  const h = await headers();
  return { ip: clientIpFromHeaders(h), userAgent: h.get("user-agent") };
}

/**
 * Map a status transition to the precise campaign lifecycle event.
 * draft/scheduled → active is an activation; a re-activation from paused is a
 * resume; active → paused is a pause; → completed is an end; → archived is an
 * archive. Falls back to campaign.updated for any other transition.
 */
function statusEventType(
  from: CampaignStatus | undefined,
  to: CampaignStatus
): CampaignEventType {
  switch (to) {
    case "active":
      return from === "paused" ? "campaign.resumed" : "campaign.activated";
    case "paused":
      return "campaign.paused";
    case "completed":
      return "campaign.ended";
    case "archived":
      return "campaign.archived";
    case "scheduled":
      return "campaign.published";
    default:
      return "campaign.updated";
  }
}

const prizeSchema = z.object({
  name: z.string().trim().min(2, "Prize name required").max(60),
  weight: z.coerce.number().int().min(0).max(10000),
  total_quantity: z.coerce.number().int().min(1).max(100000),
  expiry_days: z.coerce.number().int().min(1).max(365),
  prize_type: z
    .enum(["coupon", "physical_gift", "gift_voucher", "lucky_draw", "cashback", "wallet_points"])
    .default("coupon"),
  prize_value: z.coerce.number().min(0).max(1000000).nullable().optional(),
  // Per-tier Coupon Drop discount: each coupon tier mints its own Shopify
  // discount at this %/amount, so a tier winner gets a code carrying THIS value.
  discount_type: z.enum(["percentage", "fixed_amount"]).nullable().optional(),
  discount_value: z.coerce.number().min(0).max(1000000).nullable().optional(),
  is_fallback: z.coerce.boolean().default(false),
});

const campaignTypeSchema = z
  .enum(["scratch_win", "spin_win", "lucky_draw", "quiz_challenge", "collect_win", "coupon_drop"])
  .default("scratch_win");

/**
 * Coupon Drop discount rules the merchant configures. discount_type + a positive
 * discount_value are required (enforced via superRefine); every other rule is
 * optional. Product/collection scope are Shopify GIDs from the synced catalog.
 */
const couponRulesSchema = z.object({
  win_mode: z.enum(["weighted", "always"]).default("weighted"),
  discount_type: z.enum(["percentage", "fixed_amount"]),
  discount_value: z.coerce.number().positive("Discount value must be greater than zero").max(1000000),
  minimum_subtotal: z.coerce.number().min(0).max(10000000).nullable().optional(),
  usage_limit: z.coerce.number().int().min(1).max(1000000).nullable().optional(),
  applies_once_per_customer: z.coerce.boolean().default(false),
  expiry_days: z.coerce.number().int().min(1).max(365).nullable().optional(),
  scope_product_ids: z.array(z.string().trim().min(1)).max(250).default([]),
  scope_collection_ids: z.array(z.string().trim().min(1)).max(250).default([]),
  currency: z.string().trim().min(3).max(3).default("INR"),
  pool_target: z.coerce.number().int().min(1).max(100000).default(500),
  pool_low_watermark: z.coerce.number().int().min(0).max(100000).default(100),
});

const imageUrlSchema = z
  .string()
  .trim()
  .refine(
    (v) =>
      !v ||
      v.startsWith("data:image/") ||
      z.string().url().safeParse(v).success,
    "Invalid image URL"
  )
  .optional()
  .or(z.literal(""));

const createCampaignSchema = z
  .object({
    name: z.string().trim().min(2, "Campaign name required").max(80),
    headline: z.string().trim().min(2, "Headline required").max(60),
    description: z.string().trim().max(500).optional().or(z.literal("")),
    banner_url: imageUrlSchema,
    og_image_url: imageUrlSchema,
    logo_url: imageUrlSchema,
    terms: z.string().trim().max(1000).optional().or(z.literal("")),
    coupon_prefix: z
      .string()
      .trim()
      .min(2, "Prefix must be at least 2 characters")
      .max(10, "Prefix too long")
      .regex(/^[A-Z0-9]+$/, "Prefix must contain only uppercase letters and numbers"),
    starts_at: z.coerce.date(),
    ends_at: z.coerce.date(),
    prizes: z.array(prizeSchema).min(1, "Add at least one reward").max(8),
    campaign_type: campaignTypeSchema,
    coupon_rules: couponRulesSchema.optional(),
    slug: z
      .string()
      .trim()
      .min(2, "Campaign URL must be at least 2 characters")
      .max(40, "Campaign URL is too long")
      .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only")
      .optional(),
    source_label: z.string().trim().min(1).max(60).optional(),
    source_slug: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9_-]+$/, "Source slug: letters, numbers, - or _ only")
      .optional(),
    // When true the campaign is created live (status='active') instead of a draft.
    publish: z.coerce.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.campaign_type === "coupon_drop" && !data.coupon_rules) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coupon_rules"],
        message: "Coupon Drop campaigns require discount rules",
      });
    }
    const hasSourceLabel = !!data.source_label?.trim();
    const hasSourceSlug = !!data.source_slug?.trim();
    if (hasSourceLabel !== hasSourceSlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source_slug"],
        message: "Both source name and source slug are required for a tracking URL",
      });
    }
  });

const updateCampaignSchema = z.object({
  name: z.string().trim().min(2, "Campaign name required").max(80),
  headline: z.string().trim().min(2, "Headline required").max(60),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  banner_url: imageUrlSchema,
  logo_url: imageUrlSchema,
  terms: z.string().trim().max(1000).optional().or(z.literal("")),
  coupon_prefix: z
    .string()
    .trim()
    .min(2, "Prefix must be at least 2 characters")
    .max(10, "Prefix too long")
    .regex(/^[A-Z0-9]+$/, "Prefix must contain only uppercase letters and numbers"),
  starts_at: z.coerce.date(),
  ends_at: z.coerce.date(),
});

export interface ActionState {
  error: string | null;
  success?: boolean;
  status?: CampaignStatus;
}

export async function createCampaignAction(
  _prev: ActionState,
  payload: any
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  const validated = createCampaignSchema.safeParse(payload);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Validation failed" };
  }

  const {
    name,
    headline,
    description,
    banner_url,
    og_image_url,
    logo_url,
    terms,
    coupon_prefix,
    starts_at,
    ends_at,
    prizes,
    campaign_type,
    coupon_rules,
    publish,
    slug: requestedSlug,
    source_label,
    source_slug,
  } = validated.data;

  if (starts_at.getTime() >= ends_at.getTime()) {
    return { error: "End date must be after start date" };
  }

  if (campaign_type === "coupon_drop") {
    const shop = await getShop(repo.businessId);
    if (!shop || shop.status !== "active" || !shop.access_token_enc) {
      return { error: "Connect your Shopify store before creating a Coupon Drop campaign." };
    }
  }

  // Publish intent → go live now, or schedule if the start date is still ahead.
  // Otherwise the campaign is saved as an editable draft.
  const status: CampaignStatus = publish
    ? starts_at.getTime() > Date.now()
      ? "scheduled"
      : "active"
    : "draft";

  try {
    const slug = requestedSlug?.trim()
      ? slugify(requestedSlug.trim())
      : await repo.freeCampaignSlug(name);
    if (!slug) {
      return { error: "Could not generate a valid campaign URL" };
    }
    if (requestedSlug?.trim()) {
      const taken = await repo.isCampaignSlugTaken(slug);
      if (taken) {
        return { error: "This campaign URL is already taken. Choose another." };
      }
    }

    // Insert campaign — business_id is injected by the repository.
    const inserted = await repo.insert<{ id: string }[]>(
      "campaigns",
      {
        name,
        slug,
        headline,
        description: description || null,
        banner_url: banner_url || null,
        logo_url: logo_url || null,
        terms: terms || null,
        coupon_prefix: coupon_prefix.toUpperCase(),
        status,
        campaign_type,
        starts_at: starts_at.toISOString(),
        ends_at: ends_at.toISOString(),
      },
      "id"
    );

    const campaign = inserted?.[0];
    if (!campaign) {
      return { error: "Failed to create campaign record" };
    }

    const resolvedBannerUrl = await uploadCampaignImageFromDataUrl(
      repo.businessId,
      campaign.id,
      banner_url || null,
      "banner"
    );
    const resolvedOgImageUrl = await uploadCampaignImageFromDataUrl(
      repo.businessId,
      campaign.id,
      og_image_url || null,
      "og"
    );
    const resolvedLogoUrl = await uploadCampaignImageFromDataUrl(
      repo.businessId,
      campaign.id,
      logo_url || null,
      "logo"
    );

    if (
      resolvedBannerUrl !== (banner_url || null) ||
      resolvedOgImageUrl !== (og_image_url || null) ||
      resolvedLogoUrl !== (logo_url || null)
    ) {
      await repo.updateById("campaigns", campaign.id, {
        banner_url: resolvedBannerUrl,
        og_image_url: resolvedOgImageUrl,
        logo_url: resolvedLogoUrl,
      });
    }

    // Insert prizes (scoped through the newly-owned campaign).
    try {
      await repo.insertPrizes(
        campaign.id,
        prizes.map((p) => ({
          name: p.name,
          weight: p.weight,
          total_quantity: p.total_quantity,
          expiry_days: p.expiry_days,
          prize_type: p.prize_type,
          prize_value: p.prize_value ?? null,
          discount_type: p.discount_type ?? null,
          discount_value: p.discount_value ?? null,
          is_fallback: p.is_fallback,
        }))
      );
    } catch (pErr) {
      console.error("Create prizes error:", pErr);
      // Clean up campaign since the transaction is handled at the app layer.
      await repo.deleteById("campaigns", campaign.id);
      return { error: "Failed to create rewards" };
    }

    // Coupon Drop: persist the discount rules via a tenant-scoped RPC. Same
    // app-layer rollback pattern as prizes — a failure here drops the campaign.
    if (campaign_type === "coupon_drop" && coupon_rules) {
      try {
        await repo.callRpc("coupon_config_upsert", {
          p_business_id: repo.businessId,
          p_campaign_id: campaign.id,
          p_win_mode: coupon_rules.win_mode,
          p_discount_type: coupon_rules.discount_type,
          p_discount_value: coupon_rules.discount_value,
          p_minimum_subtotal: coupon_rules.minimum_subtotal ?? null,
          p_usage_limit: coupon_rules.usage_limit ?? null,
          p_applies_once_per_customer: coupon_rules.applies_once_per_customer,
          p_expiry_days: coupon_rules.expiry_days ?? null,
          p_scope_product_ids: coupon_rules.scope_product_ids,
          p_scope_collection_ids: coupon_rules.scope_collection_ids,
          p_currency: coupon_rules.currency,
          p_pool_target: coupon_rules.pool_target,
          p_pool_low_watermark: coupon_rules.pool_low_watermark,
        });
      } catch (cErr) {
        console.error("Create coupon config error:", cErr);
        await repo.deleteById("campaigns", campaign.id);
        return { error: "Failed to save discount rules" };
      }
    }

    if (source_label?.trim() && source_slug?.trim()) {
      try {
        await repo.createSource(source_slug.trim().toLowerCase(), source_label.trim(), campaign.id);
      } catch (sourceErr) {
        console.error("Create campaign source error:", sourceErr);
        await repo.deleteById("campaigns", campaign.id);
        const msg = String((sourceErr as Error)?.message ?? "");
        if (msg.includes("duplicate") || msg.includes("unique")) {
          return { error: "A tracking source with that slug already exists" };
        }
        return { error: "Failed to create tracking source URL" };
      }
    }

    revalidatePath("/m/campaigns");
    revalidatePath("/m/sources");
    await repo.audit("campaign.create", "campaign", campaign.id, { name, slug });
    await repo.recordEvent(
      "campaign.created",
      campaign.id,
      {
        campaignName: name,
        campaignSlug: slug,
        startDate: starts_at.toISOString(),
        endDate: ends_at.toISOString(),
        prizeCount: prizes.length,
      },
      await eventContext()
    );

    // Publishing straight to a live/scheduled state emits the matching lifecycle
    // event so the campaign timeline reflects the activation, not just creation.
    if (status !== "draft") {
      await repo.recordEvent(
        statusEventType("draft", status),
        campaign.id,
        { from: "draft", to: status },
        await eventContext()
      );
    }

    // Coupon Drop published live: mint the unique-code pool off the request path.
    // Mirrors updateCampaignStatusAction — failures set pool_status='error' and
    // the play engine falls back to internal codes so customers always win.
    if (status === "active" && campaign_type === "coupon_drop") {
      const businessId = repo.businessId;
      const campaignId = campaign.id;
      after(async () => {
        const { activateCouponDropPool } = await import(
          "@/lib/shopify/coupon-drop-orchestrator"
        );
        await activateCouponDropPool(businessId, campaignId);
      });
    }

    return { error: null, success: true, status };
  } catch (err: any) {
    console.error("Create campaign exception:", err);
    return { error: err.message ?? "An unexpected error occurred" };
  }
}

export async function updateCampaignAction(
  campaignId: string,
  _prev: ActionState,
  payload: any
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  const validated = updateCampaignSchema.safeParse(payload);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Validation failed" };
  }

  const {
    name,
    headline,
    description,
    banner_url,
    logo_url,
    terms,
    coupon_prefix,
    starts_at,
    ends_at,
  } = validated.data;

  if (starts_at.getTime() >= ends_at.getTime()) {
    return { error: "End date must be after start date" };
  }

  try {
    const resolvedBannerUrl = await uploadCampaignImageFromDataUrl(
      repo.businessId,
      campaignId,
      banner_url || null,
      "banner"
    );
    const resolvedLogoUrl = await uploadCampaignImageFromDataUrl(
      repo.businessId,
      campaignId,
      logo_url || null,
      "logo"
    );

    const affected = await repo.updateById("campaigns", campaignId, {
      name,
      headline,
      description: description || null,
      banner_url: resolvedBannerUrl,
      logo_url: resolvedLogoUrl,
      terms: terms || null,
      coupon_prefix: coupon_prefix.toUpperCase(),
      starts_at: starts_at.toISOString(),
      ends_at: ends_at.toISOString(),
    });

    if (affected === 0) {
      return { error: "Failed to update campaign details" };
    }

    revalidatePath("/m/campaigns");
    revalidatePath(`/m/campaigns/${campaignId}`);
    await repo.audit("campaign.update", "campaign", campaignId, { name });
    await repo.recordEvent(
      "campaign.updated",
      campaignId,
      { campaignName: name },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    console.error("Update campaign exception:", err);
    return { error: err.message ?? "An unexpected error occurred" };
  }
}

export async function updateCampaignStatusAction(
  campaignId: string,
  status: CampaignStatus
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  try {
    const prior = await repo.getCampaign<{ status: CampaignStatus; campaign_type: string }>(
      campaignId,
      "status, campaign_type"
    );
    const affected = await repo.updateById("campaigns", campaignId, { status });

    if (affected === 0) {
      return { error: "Failed to update campaign status" };
    }

    revalidatePath("/m/campaigns");
    revalidatePath(`/m/campaigns/${campaignId}`);
    await repo.audit("campaign.status", "campaign", campaignId, { status });
    await repo.recordEvent(
      statusEventType(prior?.status, status),
      campaignId,
      { from: prior?.status ?? null, to: status },
      await eventContext()
    );

    // Coupon Drop: on activation, mint the unique-code pool in the background.
    // Off the request path (after()) so the merchant's click returns instantly;
    // failures record pool_status='error' and the play engine falls back to
    // internal codes so customers always win.
    if (status === "active" && prior?.campaign_type === "coupon_drop") {
      const businessId = repo.businessId;
      after(async () => {
        const { activateCouponDropPool } = await import(
          "@/lib/shopify/coupon-drop-orchestrator"
        );
        await activateCouponDropPool(businessId, campaignId);
      });
    }

    return { error: null, success: true };
  } catch (err: any) {
    return { error: err.message ?? "Failed to update status" };
  }
}

export async function duplicateCampaignAction(
  campaignId: string
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  try {
    // Fetch existing campaign (tenant-scoped fetch).
    const oldCampaign = await repo.getCampaign<{
      name: string;
      headline: string;
      description: string | null;
      banner_url: string | null;
      og_image_url: string | null;
      logo_url: string | null;
      terms: string | null;
      coupon_prefix: string;
      campaign_type: string;
      starts_at: string;
      ends_at: string;
      redirect_enabled: boolean;
      redirect_delay: number;
      redirect_destination_type: string;
      redirect_url: string | null;
      exp_preloader_enabled: boolean;
      exp_preloader_duration: number;
      exp_confetti_enabled: boolean;
      exp_sound_enabled: boolean;
      exp_haptics_enabled: boolean;
      exp_open_native_app: boolean;
      exp_show_countdown: boolean;
      exp_allow_skip: boolean;
      exp_button_text: string | null;
      exp_theme: string;
    }>(
      campaignId,
      `name, headline, description, banner_url, og_image_url, logo_url, terms, coupon_prefix,
       campaign_type, starts_at, ends_at,
       redirect_enabled, redirect_delay, redirect_destination_type, redirect_url,
       exp_preloader_enabled, exp_preloader_duration, exp_confetti_enabled, exp_sound_enabled,
       exp_haptics_enabled, exp_open_native_app, exp_show_countdown, exp_allow_skip,
       exp_button_text, exp_theme`
    );

    if (!oldCampaign) return { error: "Campaign not found" };

    // Fetch existing prizes (scoped through parent campaign FK).
    const { data: oldPrizes } = await repo.selectPrizes(campaignId);

    const baseName = `${oldCampaign.name} (Copy)`;
    const slug = await repo.freeCampaignSlug(baseName);

    // Insert new campaign as draft — business_id injected by the repository.
    const inserted = await repo.insert<{ id: string }[]>(
      "campaigns",
      {
        name: baseName,
        slug,
        headline: oldCampaign.headline,
        description: oldCampaign.description,
        banner_url: oldCampaign.banner_url,
        og_image_url: oldCampaign.og_image_url,
        logo_url: oldCampaign.logo_url,
        terms: oldCampaign.terms,
        coupon_prefix: oldCampaign.coupon_prefix,
        status: "draft",
        campaign_type: oldCampaign.campaign_type,
        starts_at: oldCampaign.starts_at,
        ends_at: oldCampaign.ends_at,
        redirect_enabled: oldCampaign.redirect_enabled,
        redirect_delay: oldCampaign.redirect_delay,
        redirect_destination_type: oldCampaign.redirect_destination_type,
        redirect_url: oldCampaign.redirect_url,
        exp_preloader_enabled: oldCampaign.exp_preloader_enabled,
        exp_preloader_duration: oldCampaign.exp_preloader_duration,
        exp_confetti_enabled: oldCampaign.exp_confetti_enabled,
        exp_sound_enabled: oldCampaign.exp_sound_enabled,
        exp_haptics_enabled: oldCampaign.exp_haptics_enabled,
        exp_open_native_app: oldCampaign.exp_open_native_app,
        exp_show_countdown: oldCampaign.exp_show_countdown,
        exp_allow_skip: oldCampaign.exp_allow_skip,
        exp_button_text: oldCampaign.exp_button_text,
        exp_theme: oldCampaign.exp_theme,
      },
      "id"
    );

    const newCampaign = inserted?.[0];
    if (!newCampaign) {
      return { error: "Failed to copy campaign details" };
    }

    // Insert new prizes.
    if (oldPrizes && oldPrizes.length > 0) {
      try {
        await repo.insertPrizes(
          newCampaign.id,
          oldPrizes.map((p: any) => ({
            name: p.name,
            weight: p.weight,
            total_quantity: p.total_quantity,
            expiry_days: p.expiry_days,
            prize_type: p.prize_type ?? "coupon",
            prize_value: p.prize_value ?? null,
            discount_type: p.discount_type ?? null,
            discount_value: p.discount_value ?? null,
            is_fallback: p.is_fallback ?? false,
          }))
        );
      } catch (pErr) {
        console.error("Duplicate prizes insert error:", pErr);
        await repo.deleteById("campaigns", newCampaign.id);
        return { error: "Failed to copy rewards details" };
      }
    }

    if (oldCampaign.campaign_type === "coupon_drop") {
      const { data: couponConfig } = await repo
        .select("campaign_coupon_configs", "*")
        .eq("campaign_id", campaignId)
        .maybeSingle();

      if (couponConfig) {
        try {
          const cfg = couponConfig as unknown as {
            win_mode: string;
            discount_type: string;
            discount_value: number;
            minimum_subtotal: number | null;
            usage_limit: number | null;
            applies_once_per_customer: boolean;
            expiry_days: number | null;
            scope_product_ids: string[];
            scope_collection_ids: string[];
            currency: string;
            pool_target: number;
            pool_low_watermark: number;
          };
          await repo.callRpc("coupon_config_upsert", {
            p_business_id: repo.businessId,
            p_campaign_id: newCampaign.id,
            p_win_mode: cfg.win_mode,
            p_discount_type: cfg.discount_type,
            p_discount_value: cfg.discount_value,
            p_minimum_subtotal: cfg.minimum_subtotal ?? null,
            p_usage_limit: cfg.usage_limit ?? null,
            p_applies_once_per_customer: cfg.applies_once_per_customer,
            p_expiry_days: cfg.expiry_days,
            p_scope_product_ids: cfg.scope_product_ids,
            p_scope_collection_ids: cfg.scope_collection_ids,
            p_currency: cfg.currency,
            p_pool_target: cfg.pool_target,
            p_pool_low_watermark: cfg.pool_low_watermark,
          });
        } catch (cErr) {
          console.error("Duplicate coupon config error:", cErr);
          await repo.deleteById("campaigns", newCampaign.id);
          return { error: "Failed to copy discount rules" };
        }
      }
    }

    revalidatePath("/m/campaigns");
    await repo.audit("campaign.duplicate", "campaign", newCampaign.id, {
      source_campaign_id: campaignId,
      name: baseName,
    });
    await repo.recordEvent(
      "campaign.duplicated",
      newCampaign.id,
      { sourceCampaignId: campaignId, campaignName: baseName, slug },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    return { error: err.message ?? "Failed to duplicate campaign" };
  }
}

export async function deleteCampaignAction(campaignId: string): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  try {
    const campaign = await repo.getCampaign<{ name: string; slug: string }>(
      campaignId,
      "name, slug"
    );

    // Use the safe DB function which disables the append-only trigger
    // just long enough to null-out FK references in campaign_events,
    // then hard-deletes the campaign row — preserving the full audit trail.
    await repo.callRpc("delete_campaign", {
      p_campaign_id: campaignId,
      p_business_id: repo.businessId,
    });

    revalidatePath("/m/campaigns");
    await repo.audit("campaign.delete", "campaign", campaignId, {});
    // Campaign row is gone — event is tenant-scoped with deleted id in metadata.
    await repo.recordEvent(
      "campaign.deleted",
      null,
      {
        campaignId,
        campaignName: campaign?.name ?? null,
        campaignSlug: campaign?.slug ?? null,
      },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    return { error: err.message ?? "Failed to delete campaign" };
  }
}

export async function retryFailedWhatsAppAction(campaignId: string): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  try {
    const requeued = await repo.updateCouponsForCampaign(
      campaignId,
      {
        wa_status: "pending",
        wa_attempts: 0,
        wa_last_error: null,
        wa_next_attempt_at: null,
      },
      { wa_status: "failed" }
    );

    revalidatePath(`/m/campaigns/${campaignId}`);
    await repo.audit("campaign.retry_whatsapp", "campaign", campaignId, {});
    await repo.recordEvent(
      "whatsapp.queue",
      campaignId,
      { requeued, reason: "manual_retry" },
      await eventContext()
    );
    const dispatched = await dispatchPendingCoupons(repo.businessId, 50, campaignId);
    if (dispatched.error && dispatched.sent === 0) {
      return { error: dispatched.error };
    }
    return { error: null, success: true };
  } catch (err: any) {
    console.error("Retry WhatsApp error:", err);
    return { error: err.message ?? "Failed to retry delivery" };
  }
}

const redirectSchema = z
  .object({
    enabled: z.coerce.boolean().default(false),
    delay: z.coerce.number().refine((v) => [0, 3, 5, 10, 15, 30].includes(v), "Invalid delay"),
    destination_type: z.enum([
      "none",
      "website",
      "product",
      "instagram",
      "facebook",
      "youtube",
      "tiktok",
      "whatsapp",
      "telegram",
      "custom",
    ]),
    url: z.string().trim().max(2048).optional().or(z.literal("")),
  })
  .superRefine((d, ctx) => {
    // A redirect that is enabled with a real destination needs a target URL.
    if (d.enabled && d.destination_type !== "none" && !d.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "Add the destination URL",
      });
    }
    if (d.url && !isSafeRedirectUrl(d.url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["url"],
        message: "Enter a valid https:// URL (no local or private addresses)",
      });
    }
  });

/** Update a campaign's Post Win redirect settings (Feature 3). */
export async function updateRedirectAction(
  campaignId: string,
  _prev: ActionState,
  payload: unknown
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  const validated = redirectSchema.safeParse(payload);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = validated.data;

  // A previous state read lets us record enabled vs disabled vs updated.
  const prior = await repo.getCampaign<{ redirect_enabled: boolean }>(
    campaignId,
    "redirect_enabled"
  );
  const wasEnabled = prior?.redirect_enabled ?? false;

  try {
    await repo.updateRedirect(
      campaignId,
      d.enabled,
      d.delay,
      d.destination_type,
      d.url || null
    );

    revalidatePath(`/m/campaigns/${campaignId}`);
    const eventType =
      d.enabled && !wasEnabled
        ? "redirect.enabled"
        : !d.enabled && wasEnabled
          ? "redirect.disabled"
          : "redirect.updated";
    await repo.audit("redirect.update", "campaign", campaignId, {
      enabled: d.enabled,
      delay: d.delay,
      destination_type: d.destination_type,
    });
    await repo.recordEvent(
      eventType,
      campaignId,
      { delay: d.delay, destinationType: d.destination_type },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    console.error("Update redirect exception:", err);
    return { error: "Failed to save Post Win settings" };
  }
}

/** Update the Coupon Drop discount rules for a campaign (ownership-guarded). */
export async function updateCouponConfigAction(
  campaignId: string,
  _prev: ActionState,
  payload: unknown
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  const validated = couponRulesSchema.safeParse(payload);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Validation failed" };
  }
  const r = validated.data;

  try {
    await repo.callRpc("coupon_config_upsert", {
      p_business_id: repo.businessId,
      p_campaign_id: campaignId,
      p_win_mode: r.win_mode,
      p_discount_type: r.discount_type,
      p_discount_value: r.discount_value,
      p_minimum_subtotal: r.minimum_subtotal ?? null,
      p_usage_limit: r.usage_limit ?? null,
      p_applies_once_per_customer: r.applies_once_per_customer,
      p_expiry_days: r.expiry_days ?? null,
      p_scope_product_ids: r.scope_product_ids,
      p_scope_collection_ids: r.scope_collection_ids,
      p_currency: r.currency,
      p_pool_target: r.pool_target,
      p_pool_low_watermark: r.pool_low_watermark,
    });
    revalidatePath(`/m/campaigns/${campaignId}`);
    await repo.audit("coupon_config.update", "campaign", campaignId, {
      discount_type: r.discount_type,
      discount_value: r.discount_value,
    });
    return { error: null, success: true };
  } catch (err: any) {
    console.error("Update coupon config exception:", err);
    return { error: "Failed to save discount rules" };
  }
}

const experienceSchema = z.object({
  preloader_enabled: z.coerce.boolean().default(true),
  preloader_duration: z.coerce
    .number()
    .refine((v) => [300, 600, 1000].includes(v), "Invalid duration"),
  confetti_enabled: z.coerce.boolean().default(true),
  sound_enabled: z.coerce.boolean().default(false),
  haptics_enabled: z.coerce.boolean().default(false),
  open_native_app: z.coerce.boolean().default(true),
  show_countdown: z.coerce.boolean().default(true),
  allow_skip: z.coerce.boolean().default(true),
  button_text: z.string().trim().max(30).optional().or(z.literal("")),
  theme: z.enum(["light", "dark", "brand"]),
});

/** Update a campaign's Customer Experience settings (V2 customer app). */
export async function updateExperienceAction(
  campaignId: string,
  _prev: ActionState,
  payload: unknown
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  const validated = experienceSchema.safeParse(payload);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = validated.data;

  try {
    await repo.updateExperience(campaignId, {
      preloaderEnabled: d.preloader_enabled,
      preloaderDuration: d.preloader_duration,
      confettiEnabled: d.confetti_enabled,
      soundEnabled: d.sound_enabled,
      hapticsEnabled: d.haptics_enabled,
      openNativeApp: d.open_native_app,
      showCountdown: d.show_countdown,
      allowSkip: d.allow_skip,
      buttonText: d.button_text || null,
      theme: d.theme,
    });

    revalidatePath(`/m/campaigns/${campaignId}`);
    await repo.audit("experience.update", "campaign", campaignId, {
      preloader: d.preloader_enabled,
      confetti: d.confetti_enabled,
      theme: d.theme,
    });
    await repo.recordEvent(
      "settings.updated",
      campaignId,
      { section: "customer_experience", theme: d.theme },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    console.error("Update experience exception:", err);
    return { error: "Failed to save Customer Experience settings" };
  }
}
