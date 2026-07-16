"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { clientIpFromHeaders } from "@/lib/ip";
import { isSafeRedirectUrl } from "@/lib/validation";
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
  is_fallback: z.coerce.boolean().default(false),
});

const createCampaignSchema = z.object({
  name: z.string().trim().min(2, "Campaign name required").max(80),
  headline: z.string().trim().min(2, "Headline required").max(60),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  banner_url: z.string().trim().url("Invalid banner image URL").optional().or(z.literal("")),
  logo_url: z.string().trim().url("Invalid logo image URL").optional().or(z.literal("")),
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
});

const updateCampaignSchema = z.object({
  name: z.string().trim().min(2, "Campaign name required").max(80),
  headline: z.string().trim().min(2, "Headline required").max(60),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  banner_url: z.string().trim().url("Invalid banner image URL").optional().or(z.literal("")),
  logo_url: z.string().trim().url("Invalid logo image URL").optional().or(z.literal("")),
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
    logo_url,
    terms,
    coupon_prefix,
    starts_at,
    ends_at,
    prizes,
  } = validated.data;

  if (starts_at.getTime() >= ends_at.getTime()) {
    return { error: "End date must be after start date" };
  }

  try {
    const slug = await repo.freeCampaignSlug(name);

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
        status: "draft",
        starts_at: starts_at.toISOString(),
        ends_at: ends_at.toISOString(),
      },
      "id"
    );

    const campaign = inserted?.[0];
    if (!campaign) {
      return { error: "Failed to create campaign record" };
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
          is_fallback: p.is_fallback,
        }))
      );
    } catch (pErr) {
      console.error("Create prizes error:", pErr);
      // Clean up campaign since the transaction is handled at the app layer.
      await repo.deleteById("campaigns", campaign.id);
      return { error: "Failed to create rewards" };
    }

    revalidatePath("/m/campaigns");
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
    return { error: null, success: true };
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
    const affected = await repo.updateById("campaigns", campaignId, {
      name,
      headline,
      description: description || null,
      banner_url: banner_url || null,
      logo_url: logo_url || null,
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
    const prior = await repo.getCampaign<{ status: CampaignStatus }>(
      campaignId,
      "status"
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
      logo_url: string | null;
      terms: string | null;
      coupon_prefix: string;
    }>(campaignId);

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
        logo_url: oldCampaign.logo_url,
        terms: oldCampaign.terms,
        coupon_prefix: oldCampaign.coupon_prefix,
        status: "draft",
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 15 * 86400 * 1000).toISOString(), // +15 days default
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
            is_fallback: p.is_fallback ?? false,
          }))
        );
      } catch (pErr) {
        console.error("Duplicate prizes insert error:", pErr);
        await repo.deleteById("campaigns", newCampaign.id);
        return { error: "Failed to copy rewards details" };
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
      { wa_status: "pending", wa_attempts: 0 },
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
