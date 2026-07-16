"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getTenantRepository } from "@/lib/db/tenant-repository";
import { clientIpFromHeaders } from "@/lib/ip";
import { z } from "zod";

/** Request context (ip + user agent) for event attribution. */
async function eventContext(): Promise<{ ip: string; userAgent: string | null }> {
  const h = await headers();
  return { ip: clientIpFromHeaders(h), userAgent: h.get("user-agent") };
}

const rewardSchema = z.object({
  name: z.string().trim().min(2, "Reward name required").max(60),
  weight: z.coerce.number().int().min(0).max(10000),
  total_quantity: z.coerce.number().int().min(1).max(100000),
  expiry_days: z.coerce.number().int().min(1).max(365),
  prize_type: z
    .enum(["coupon", "physical_gift", "gift_voucher", "lucky_draw", "cashback", "wallet_points"])
    .default("coupon"),
  prize_value: z.coerce.number().min(0).max(1000000).nullable().optional(),
  is_fallback: z.coerce.boolean().default(false),
  image_url: z.string().trim().url("Invalid image URL").nullable().optional().or(z.literal("")),
  background_color: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Use a #RRGGBB colour")
    .nullable()
    .optional()
    .or(z.literal("")),
  description: z.string().trim().max(280).nullable().optional().or(z.literal("")),
  badge: z.string().trim().max(24).nullable().optional().or(z.literal("")),
  sort_order: z.coerce.number().int().min(0).max(10000).default(0),
  priority: z.coerce.number().int().min(0).max(10000).default(0),
});

export interface ActionState {
  error: string | null;
  success?: boolean;
}

export async function addRewardAction(
  campaignId: string,
  _prev: ActionState,
  payload: unknown
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  const validated = rewardSchema.safeParse(payload);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = validated.data;

  try {
    await repo.insertPrizes(campaignId, [
      {
        name: d.name,
        weight: d.weight,
        total_quantity: d.total_quantity,
        expiry_days: d.expiry_days,
        prize_type: d.prize_type,
        prize_value: d.prize_value ?? null,
        is_fallback: d.is_fallback,
        image_url: d.image_url || null,
        background_color: d.background_color || null,
        description: d.description || null,
        badge: d.badge || null,
        sort_order: d.sort_order,
        priority: d.priority,
      },
    ]);

    revalidatePath(`/m/campaigns/${campaignId}`);
    revalidatePath("/m/rewards");
    await repo.audit("reward.create", "prize", null, { campaignId, name: d.name });
    await repo.recordEvent(
      "reward.created",
      campaignId,
      { rewardName: d.name, rewardType: d.prize_type },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    console.error("Add reward exception:", err);
    return { error: err.message ?? "Failed to add reward" };
  }
}

export async function updateRewardAction(
  campaignId: string,
  prizeId: string,
  _prev: ActionState,
  payload: unknown
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  const validated = rewardSchema.safeParse(payload);
  if (!validated.success) {
    return { error: validated.error.issues[0]?.message ?? "Validation failed" };
  }
  const d = validated.data;

  try {
    // Ownership of the prize is enforced in SQL by the campaign->business
    // join inside merchant_update_prize.
    await repo.callRpc("merchant_update_prize", {
      p_business_id: repo.businessId,
      p_campaign_id: campaignId,
      p_prize_id: prizeId,
      p_name: d.name,
      p_weight: d.weight,
      p_total_quantity: d.total_quantity,
      p_expiry_days: d.expiry_days,
      p_prize_type: d.prize_type,
      p_prize_value: d.prize_value ?? null,
      p_is_fallback: d.is_fallback,
      p_image_url: d.image_url || null,
      p_background_color: d.background_color || null,
      p_description: d.description || null,
      p_badge: d.badge || null,
      p_sort_order: d.sort_order,
      p_priority: d.priority,
    });

    revalidatePath(`/m/campaigns/${campaignId}`);
    revalidatePath("/m/rewards");
    await repo.audit("reward.update", "prize", prizeId, { campaignId, name: d.name });
    await repo.recordEvent(
      "reward.updated",
      campaignId,
      { rewardId: prizeId, rewardName: d.name },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    console.error("Update reward exception:", err);
    return { error: err.message ?? "Failed to update reward" };
  }
}

export async function deleteRewardAction(
  campaignId: string,
  prizeId: string
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  try {
    await repo.callRpc("merchant_delete_prize", {
      p_business_id: repo.businessId,
      p_campaign_id: campaignId,
      p_prize_id: prizeId,
    });

    revalidatePath(`/m/campaigns/${campaignId}`);
    revalidatePath("/m/rewards");
    await repo.audit("reward.delete", "prize", prizeId, { campaignId });
    await repo.recordEvent(
      "reward.deleted",
      campaignId,
      { rewardId: prizeId },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    console.error("Delete reward exception:", err);
    return { error: err.message ?? "Failed to delete reward" };
  }
}

export async function duplicateRewardAction(
  campaignId: string,
  prizeId: string
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  try {
    const newId = await repo.duplicatePrize(campaignId, prizeId);
    revalidatePath(`/m/campaigns/${campaignId}`);
    revalidatePath("/m/rewards");
    await repo.audit("reward.duplicate", "prize", newId, { campaignId, sourcePrizeId: prizeId });
    await repo.recordEvent(
      "reward.duplicated",
      campaignId,
      { sourceRewardId: prizeId, newRewardId: newId },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    console.error("Duplicate reward exception:", err);
    return { error: err.message ?? "Failed to duplicate reward" };
  }
}

export async function setRewardActiveAction(
  campaignId: string,
  prizeId: string,
  active: boolean
): Promise<ActionState> {
  const repo = await getTenantRepository();
  if (!repo) redirect("/m/login");

  if (!(await repo.ownsCampaign(campaignId))) {
    return { error: "Unauthorized" };
  }

  try {
    await repo.setPrizeActive(campaignId, prizeId, active);
    revalidatePath(`/m/campaigns/${campaignId}`);
    revalidatePath("/m/rewards");
    await repo.audit(active ? "reward.enable" : "reward.disable", "prize", prizeId, { campaignId });
    await repo.recordEvent(
      active ? "reward.enabled" : "reward.disabled",
      campaignId,
      { rewardId: prizeId },
      await eventContext()
    );
    return { error: null, success: true };
  } catch (err: any) {
    console.error("Toggle reward exception:", err);
    return { error: err.message ?? "Failed to update reward status" };
  }
}
